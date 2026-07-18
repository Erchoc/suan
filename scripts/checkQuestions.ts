/**
 * 题目质量校验脚本
 *
 * 用法：pnpm run check:questions [--grade N] [--kp ID] [--limit N] [--dry-run] [--force]
 *
 * 工作流程：
 *   1. 读取 public/questions.json
 *   2. 默认跳过已校验的题目（enable 字段已设置）；--force 全部重新校验
 *   3. 逐题发送给 LLM 做质量审核
 *   4. 异常题目：设置 enable=false，checkMessage 写入原因
 *   5. 正常题目：设置 enable=true，清除 checkMessage
 *   6. 支持断点续跑（默认跳过已有 enable 字段的题目）
 *
 * 参数：
 *   --grade N    只校验第 N 年级的题目
 *   --kp ID      只校验指定知识点的题目
 *   --start ID   从指定题目 ID 开始校验（含该题，用于网络中断后手动续跑）
 *   --limit N    最多校验 N 道题（默认全部）
 *   --batch N    每批发送 N 道题（默认 5，减少 API 调用次数）
 *   --force      忽略 enable 字段，从第 1 道开始全量重新校验
 *   --dry-run    只打印 prompt，不调用 API
 *
 * 环境变量：
 *   AI_API_KEY   - API 密钥
 *   AI_BASE_URL  - OpenAI 兼容接口地址
 *   AI_MODEL     - 模型名称
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_PATH = path.join(ROOT, 'public/questions.json');

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface Choice { label: string; content: string }

interface Question {
  id: string;
  kp_id: string;
  kp_name: string;
  grade: string;
  semester: string;
  difficulty: string;
  type?: string;
  question: string;
  blanks: string[];
  choices?: Choice[];
  correctChoice?: string;
  solution: string;
  common_mistake: string;
  hint: string;
  enable?: boolean;
  checkMessage?: string;
}

interface CheckResult {
  id: string;
  status: 'ok' | 'error';
  reason?: string;
}

// ─── 参数解析 ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};
const hasFlag = (flag: string) => args.includes(flag);

const GRADE_FILTER = getArg('--grade') ? parseInt(getArg('--grade')!) : null;
const KP_FILTER    = getArg('--kp');
const START_ID     = getArg('--start');
const LIMIT        = getArg('--limit') ? parseInt(getArg('--limit')!) : Infinity;
const BATCH_SIZE   = getArg('--batch') ? parseInt(getArg('--batch')!) : 5;
const FORCE        = hasFlag('--force');
const DRY_RUN      = hasFlag('--dry-run');

// ─── AI 客户端 ────────────────────────────────────────────────────────────────

const AI_API_KEY  = process.env.AI_API_KEY ?? '';
const AI_BASE_URL = process.env.AI_BASE_URL ?? '';
const AI_MODEL    = process.env.AI_MODEL ?? '';

if (!DRY_RUN) {
  if (!AI_API_KEY) { console.error('❌ 请设置环境变量 AI_API_KEY'); process.exit(1); }
  if (!AI_BASE_URL) { console.error('❌ 请设置环境变量 AI_BASE_URL'); process.exit(1); }
  if (!AI_MODEL) { console.error('❌ 请设置环境变量 AI_MODEL'); process.exit(1); }
}

const client = DRY_RUN ? null : new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL });

// ─── 数据加载 ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(QUESTIONS_PATH)) {
  console.error('❌ 找不到 public/questions.json');
  process.exit(1);
}

const allQuestions: Question[] = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));

// ─── 筛选待校验题目 ──────────────────────────────────────────────────────────

// --force：所有题目都重新校验；默认：只处理 enable === undefined 的未校验题目
let pending = FORCE
  ? [...allQuestions]
  : allQuestions.filter(q => q.enable === undefined);

if (GRADE_FILTER) {
  const gradeNames = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
  const gName = gradeNames[GRADE_FILTER - 1];
  pending = pending.filter(q => q.grade === gName);
}
if (KP_FILTER) {
  pending = pending.filter(q => q.kp_id === KP_FILTER);
}
if (START_ID) {
  const startIdx = pending.findIndex(q => q.id === START_ID);
  if (startIdx === -1) {
    console.error(`❌ 找不到题目 ID "${START_ID}"（可能不存在）`);
    process.exit(1);
  }
  console.log(`⏩ --start ${START_ID}：跳过前 ${startIdx} 道题，从第 ${startIdx + 1} 道开始`);
  pending = pending.slice(startIdx);
}

pending = pending.slice(0, LIMIT);

const alreadyChecked = allQuestions.filter(q => q.enable !== undefined).length;

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  📊 题目总数:     ${allQuestions.length}`);
console.log(`     已校验:       ${alreadyChecked}`);
console.log(`     待校验:       ${pending.length}${FORCE ? '（--force 全量）' : ''}`);
console.log(`     批次大小:     ${BATCH_SIZE}`);
if (START_ID) console.log(`     续跑起点:     ${START_ID}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (pending.length === 0) {
  console.log('✅ 全部题目已校验完成');
  process.exit(0);
}

if (!DRY_RUN) {
  console.log(`🔗 接口地址: ${AI_BASE_URL}`);
  console.log(`🤖 使用模型: ${AI_MODEL}\n`);
}

// ─── Prompt 构造 ──────────────────────────────────────────────────────────────

function buildCheckPrompt(batch: Question[]): string {
  const questionsJson = batch.map(q => {
    const obj: Record<string, unknown> = {
      id: q.id,
      kp_id: q.kp_id,
      kp_name: q.kp_name,
      grade: q.grade,
      type: q.type || 'fill_blank',
      question: q.question,
      blanks: q.blanks,
      solution: q.solution,
    };
    if (q.choices) obj.choices = q.choices;
    if (q.correctChoice) obj.correctChoice = q.correctChoice;
    return obj;
  });

  return `你是一位资深的小学数学教研员，正在审核一批面向小学1-6年级的数学题目。
请严格逐题检查以下 ${batch.length} 道题目，判断每道题是否存在问题。

## 审核标准（发现以下任一问题即判定为异常）

### A. 答案正确性
- 填空题：根据题意重新计算，blanks 中的答案是否完全正确
- 选择题：correctChoice 指定的选项是否确实是唯一正确答案
- 计算过程和 solution 是否一致

### B. 题目表述质量
- 题意是否清晰无歧义
- 是否存在语法错误或错别字
- 填空位置（____）是否合理，是否存在答案不唯一的情况
  （例如"早饭"也可写"早餐"，这类主观性表述不适合填空题）
- 题目难度是否匹配标注的 grade（年级）

### C. 题型适配性
- fill_blank（填空题）的答案是否有且仅有一种标准写法
  - 反例：答案是中文词语、成语、文字描述等存在多种合理写法的
  - 正例：答案是确切数字、分数、小数、单位换算结果
- 答案如果是分数，是否已化简到最简

### D. 知识点匹配
- 题目考察内容是否确实属于标注的 kp_name（知识点）
- 是否超出该年级的知识范围

## 输入题目

${JSON.stringify(questionsJson, null, 2)}

## 输出格式

只输出 JSON 数组，每道题一个对象。正常题目 status="ok"，异常题目 status="error" 并给出 reason。
不要有任何其他文字、不要有 markdown 代码块。

[
  { "id": "题目ID", "status": "ok" },
  { "id": "题目ID", "status": "error", "reason": "具体异常原因（一句话）" }
]`;
}

// ─── 单批次校验 ──────────────────────────────────────────────────────────────

async function checkBatch(batch: Question[], batchNum: number, totalBatches: number): Promise<CheckResult[]> {
  const prompt = buildCheckPrompt(batch);
  const ids = batch.map(q => q.id).join(', ');

  if (DRY_RUN) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[dry-run] 批次 ${batchNum}/${totalBatches}（${batch.length} 道）: ${ids}`);
    console.log(prompt.slice(0, 500) + '\n...(省略)');
    return [];
  }

  console.log(`  [${batchNum}/${totalBatches}] 校验: ${ids}`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`    🔄 第 ${attempt}/3 次重试，等待 ${delay / 1000}s…`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const response = await client!.chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      });

      const raw = response.choices[0]?.message?.content ?? '';
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error(`返回不含 JSON 数组:\n${raw.slice(0, 200)}`);

      const parsed: CheckResult[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error('解析结果不是数组');

      const validResults = parsed.filter(r =>
        typeof r.id === 'string' && ['ok', 'error'].includes(r.status)
      );

      if (validResults.length === 0) throw new Error('无有效校验结果');

      return validResults;
    } catch (err) {
      if (attempt === 3) {
        console.error(`    ❌ 批次 ${batchNum} 全部重试失败: ${err}`);
        return [];
      }
      console.warn(`    ⚠️  第 ${attempt} 次失败: ${err}`);
    }
  }

  return [];
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  const idToIndex = new Map<string, number>();
  allQuestions.forEach((q, i) => idToIndex.set(q.id, i));

  const batches: Question[][] = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    batches.push(pending.slice(i, i + BATCH_SIZE));
  }

  let okCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const results = await checkBatch(batch, bi + 1, batches.length);

    if (results.length === 0) {
      skipCount += batch.length;
      continue;
    }

    const resultMap = new Map(results.map(r => [r.id, r]));

    for (const q of batch) {
      const idx = idToIndex.get(q.id);
      if (idx === undefined) continue;

      const result = resultMap.get(q.id);
      if (!result) {
        skipCount++;
        continue;
      }

      if (result.status === 'ok') {
        allQuestions[idx].enable = true;
        delete allQuestions[idx].checkMessage;
        okCount++;
        console.log(`    ✅ ${q.id} ${q.kp_name} — 正常`);
      } else {
        allQuestions[idx].enable = false;
        allQuestions[idx].checkMessage = result.reason ?? '未知原因';
        errorCount++;
        console.log(`    ❌ ${q.id} ${q.kp_name} — ${allQuestions[idx].checkMessage}`);
      }
    }

    // 每批完成后实时写入
    fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(allQuestions, null, 2), 'utf-8');

    if (!DRY_RUN && bi < batches.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log([
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  🎉 校验完成',
    `     正常:   ${okCount} 道 (enable=true)`,
    `     异常:   ${errorCount} 道 (enable=false)`,
    `     跳过:   ${skipCount} 道 (API 未返回结果)`,
    `  📁 已更新: ${QUESTIONS_PATH}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ].join('\n'));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
