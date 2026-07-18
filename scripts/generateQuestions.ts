/**
 * 题目批量生成脚本
 * 用法：pnpm run gen:questions [--grade N] [--kp ID] [--type MODE] [--concurrency N] [--append] [--dry-run]
 *
 * 参数：
 *   --grade N         只生成第 N 年级的题目
 *   --kp ID           只生成指定知识点的题目
 *   --type MODE       题型模式：fill_blank | choice | half（各一半）| auto（默认，按年级分配）
 *   --concurrency N   并发数量（默认 1，建议不超过 5 以避免 API 限速）
 *   --append          追加模式：即使知识点已有题目，也继续生成新题追加进去（ID 自动续号）
 *   --dry-run         只打印 Prompt，不实际调用 API
 *
 * 题型模式说明：
 *   fill_blank  — 仅生成填空题（与存量题一致）
 *   choice      — 仅生成选择题
 *   half        — 5 道选择 + 5 道填空
 *   auto        — 1-3年级: 5选择+3填空+2混合; 4-6年级: 3选择+5填空+2混合
 *
 * 环境变量（必须）：
 *   AI_API_KEY   - API 密钥
 *   AI_BASE_URL  - OpenAI 兼容接口地址（如 https://api.openai.com/v1）
 *   AI_MODEL     - 模型名称（默认 gemini-3-flash）
 *
 * 进度文件：
 *   gen-progress.json  - 记录每个知识点的生成状态（成功/失败/失败次数）
 *   questions.json     - 题目数据唯一来源（成功后实时写入）
 *   gen-errors.log     - 失败详情日志
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GRAPH_PATH     = path.join(ROOT, 'src/data/knowledge-graph.json');
const QUESTIONS_PATH = path.join(ROOT, 'public/questions.json');
const LOGS_DIR       = path.join(ROOT, 'logs');
const PROGRESS_PATH  = path.join(ROOT, 'gen-progress.json');
const ERROR_LOG      = path.join(LOGS_DIR, 'gen-errors.log');

const MAX_RETRIES = 3;

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface Choice { label: string; content: string }

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface KPRaw   { id: string; name: string; deps: string[] }
interface UnitRaw { id: string; name: string; semester: string; kps: KPRaw[] }
interface DomainRaw { id: string; name: string; icon: string; units: UnitRaw[] }
interface GradeRaw  { id: string; name: string; color: string; domains: DomainRaw[] }
interface GraphData {
  meta: { bridgePoints: { groups: { kpIds: string[] }[] } };
  grades: GradeRaw[];
}

interface Question {
  id: string; kp_id: string; kp_name: string; grade: string; semester: string;
  difficulty: string; type?: string; question: string; blanks: string[];
  choices?: Choice[]; correctChoice?: string;
  solution: string; common_mistake: string; hint: string;
}

interface KPMeta {
  id: string; name: string; deps: string[]; gradeName: string; gradeNum: number;
  unitSemester: string; unitName: string; domainName: string; isBridge: boolean;
}

type TypeMode = 'fill_blank' | 'choice' | 'half' | 'auto';

// ─── 进度追踪 ─────────────────────────────────────────────────────────────────

interface FailedEntry {
  totalAttempts: number;
  lastError: string;
  lastAttemptAt: string;
}

interface ProgressData {
  updatedAt: string;
  succeeded: string[];
  failed: Record<string, FailedEntry>;
}

function loadProgress(): ProgressData {
  if (fs.existsSync(PROGRESS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    } catch {
      console.warn('⚠️  gen-progress.json 解析失败，将重建');
    }
  }
  return { updatedAt: '', succeeded: [], failed: {} };
}

function saveProgress(progress: ProgressData) {
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf-8');
}

// ─── 参数解析 ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};
const hasFlag = (flag: string) => args.includes(flag);

const GRADE_FILTER  = getArg('--grade') ? parseInt(getArg('--grade')!) : null;
const KP_FILTER     = getArg('--kp');
const DRY_RUN       = hasFlag('--dry-run');
const APPEND_MODE   = hasFlag('--append');
const TYPE_MODE     = (getArg('--type') ?? 'auto') as TypeMode;
const CONCURRENCY   = Math.max(1, parseInt(getArg('--concurrency') ?? '1'));

if (!['fill_blank', 'choice', 'half', 'auto'].includes(TYPE_MODE)) {
  console.error('❌ --type 参数无效，可选: fill_blank | choice | half | auto');
  process.exit(1);
}

// ─── AI 客户端 ────────────────────────────────────────────────────────────────

const AI_API_KEY = process.env.AI_API_KEY ?? '';
const AI_BASE_URL = process.env.AI_BASE_URL ?? '';
const AI_MODEL   = process.env.AI_MODEL ?? 'gemini-3-flash';

if (!DRY_RUN) {
  if (!AI_API_KEY) {
    console.error('❌ 请设置环境变量 AI_API_KEY');
    process.exit(1);
  }
  if (!AI_BASE_URL) {
    console.error('❌ 请设置环境变量 AI_BASE_URL（如 https://api.openai.com/v1）');
    process.exit(1);
  }
}

const client = DRY_RUN ? null : new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL });

// 确保 logs 目录存在
fs.mkdirSync(LOGS_DIR, { recursive: true });

// ─── 数据加载 ─────────────────────────────────────────────────────────────────

const graphData: GraphData = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));

const bridgeSet = new Set<string>();
graphData.meta.bridgePoints.groups.forEach(g => g.kpIds.forEach(id => bridgeSet.add(id)));

const allKPs: KPMeta[] = [];
graphData.grades.forEach((grade, gi) => {
  grade.domains.forEach(domain => {
    domain.units.forEach(unit => {
      unit.kps.forEach(kp => {
        allKPs.push({
          id: kp.id, name: kp.name, deps: kp.deps,
          gradeName: grade.name, gradeNum: gi + 1,
          unitSemester: unit.semester, unitName: unit.name,
          domainName: domain.name, isBridge: bridgeSet.has(kp.id),
        });
      });
    });
  });
});

// ─── 筛选目标 ─────────────────────────────────────────────────────────────────

let targetKPs = allKPs;
if (KP_FILTER) {
  targetKPs = allKPs.filter(k => k.id === KP_FILTER);
  if (targetKPs.length === 0) {
    console.error(`❌ 找不到知识点 ${KP_FILTER}`);
    process.exit(1);
  }
} else if (GRADE_FILTER) {
  targetKPs = allKPs.filter(k => k.gradeNum === GRADE_FILTER);
}

// ─── 加载已有题目 & 进度（断点续跑）─────────────────────────────────────────

let existingQuestions: Question[] = [];
if (fs.existsSync(QUESTIONS_PATH)) {
  existingQuestions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));
}
const doneKPIds = new Set(existingQuestions.map(q => q.kp_id));

const progress = loadProgress();
const historyFailedIds = Object.keys(progress.failed);
const historyFailedInScope = historyFailedIds.filter(id =>
  targetKPs.some(k => k.id === id)
);

// --append 模式：不跳过已有知识点，直接追加新题
// 普通模式：跳过已有知识点（断点续跑）
const pendingKPs = APPEND_MODE
  ? targetKPs
  : targetKPs.filter(k => !doneKPIds.has(k.id));

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  📊 历史进度（gen-progress.json）');
console.log(`     成功: ${progress.succeeded.length} 个知识点`);
if (historyFailedInScope.length > 0) {
  console.log(`     失败: ${historyFailedInScope.length} 个（将在本次重新尝试）`);
  historyFailedInScope.forEach(id => {
    const entry = progress.failed[id];
    const kp = allKPs.find(k => k.id === id);
    console.log(`       - ${id} ${kp?.name ?? ''} | 历史尝试 ${entry.totalAttempts} 次 | 上次错误: ${entry.lastError.slice(0, 60)}`);
  });
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  📚 目标知识点: ${targetKPs.length} 个`);
console.log(`     已完成:   ${doneKPIds.size} 个（questions.json 中已有）`);
console.log(`     待处理:   ${pendingKPs.length} 个${historyFailedInScope.length > 0 ? `（含 ${historyFailedInScope.length} 个历史失败重试）` : ''}`);
console.log(`  📝 题型模式: ${TYPE_MODE}`);
console.log(`  ⚡ 并发数量: ${CONCURRENCY}`);
if (APPEND_MODE) console.log(`  ➕ 追加模式: 已有知识点将追加新题目`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!DRY_RUN) {
  console.log(`🔗 接口地址: ${AI_BASE_URL}`);
  console.log(`🤖 使用模型: ${AI_MODEL}\n`);
}

if (pendingKPs.length === 0) {
  console.log('✅ 全部知识点已有题目，无需重新生成');
  process.exit(0);
}

// ─── 题型分配：根据 --type 和年级决定每个 KP 的生成计划 ─────────────────────

interface GenPlan {
  type: 'fill_blank' | 'choice' | 'mixed';
  count: number;
}

function getGenPlans(kp: KPMeta): GenPlan[] {
  switch (TYPE_MODE) {
    case 'fill_blank':
      return [{ type: 'fill_blank', count: 10 }];
    case 'choice':
      return [{ type: 'choice', count: 10 }];
    case 'half':
      return [
        { type: 'choice', count: 5 },
        { type: 'fill_blank', count: 5 },
      ];
    case 'auto':
      if (kp.gradeNum <= 3) {
        // 低年级：5选择+3填空+2混合
        return [
          { type: 'choice', count: 5 },
          { type: 'fill_blank', count: 3 },
          { type: 'mixed', count: 2 },
        ];
      } else {
        // 高年级：3选择+5填空+2混合
        return [
          { type: 'choice', count: 3 },
          { type: 'fill_blank', count: 5 },
          { type: 'mixed', count: 2 },
        ];
      }
  }
}

// ─── Prompt 构造 ──────────────────────────────────────────────────────────────

// 计算某知识点某题型已有的最大序号（用于 append 模式避免 ID 冲突）
function getNextSeqNum(kpId: string, genType: 'fill_blank' | 'choice' | 'mixed'): number {
  const prefix = genType === 'fill_blank' ? `${kpId}-`
    : genType === 'choice' ? `${kpId}-c`
    : `${kpId}-m`;
  let max = 0;
  existingQuestions.forEach(q => {
    if (q.id.startsWith(prefix)) {
      const suffix = q.id.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return max + 1;
}

function buildPrompt(kp: KPMeta, genType: 'fill_blank' | 'choice' | 'mixed', count: number, startSeq: number): string {
  const depsDesc  = kp.deps.length > 0 ? `\n前置知识点：${kp.deps.join('、')}` : '';
  const bridgeNote = kp.isBridge ? '\n⚠️ 该知识点是小初衔接桥头堡，请适当增加综合应用题比例。' : '';
  const seqStr = String(startSeq).padStart(2, '0');

  const kpHeader = `知识点信息：
- ID: ${kp.id}
- 名称: ${kp.name}
- 年级: ${kp.gradeName}（${kp.gradeNum}年级${kp.unitSemester}学期）
- 所属领域: ${kp.domainName}
- 所属单元: ${kp.unitName}${depsDesc}${bridgeNote}`;

  if (genType === 'fill_blank') {
    return `你是一位专业的小学数学教师，请为以下知识点出 ${count} 道填空题。

${kpHeader}

要求：
1. 每道题只考察本知识点，不超出小学范围
2. 难度分布：简单、中等、困难合理分配，共 ${count} 道
3. 题目必须是填空题，用 ____ 表示填空处（一道题最多3个填空）
4. 计算结果必须正确，答案精确（分数请化简到最简）
5. question 字段中用 ____ 表示填空，blanks 数组按顺序对应每个 ____
6. 每题序号从 ${seqStr} 开始，格式为 "${kp.id}-${seqStr}"
7. 【重要】blanks 中的答案只能是孩子用普通键盘能直接输入的内容：
   - 整数（如 12、-3）、小数（如 0.5）、百分数（如 75%）、分数（如 3/4）
   - 不能含有 ²、³、√ 等数学符号
   - 如果正确答案本身含有平方、立方、根号等符号（无法用纯数字表达），请改为选择题（choice 类型）
8. 题目正文（question）中可以出现 ²、³、√ 等符号，但学生只需填写计算结果数字

请严格按以下 JSON 格式输出（只输出 JSON 数组，不要有任何其他文字、不要有 markdown 代码块）：
[
  {
    "id": "${kp.id}-${seqStr}",
    "kp_id": "${kp.id}",
    "kp_name": "${kp.name}",
    "grade": "${kp.gradeName}",
    "semester": "${kp.unitSemester}学期",
    "difficulty": "easy",
    "type": "fill_blank",
    "question": "题目正文，____ 表示填空处",
    "blanks": ["答案"],
    "solution": "完整解题过程",
    "common_mistake": "学生常见的错误",
    "hint": "解题提示"
  }
]`;
  }

  if (genType === 'choice') {
    return `你是一位专业的小学数学教师，请为以下知识点出 ${count} 道选择题（4选1）。

${kpHeader}

要求：
1. 每道题只考察本知识点，不超出小学范围
2. 难度分布：简单、中等、困难合理分配，共 ${count} 道
3. 每题 4 个选项（A/B/C/D），只有 1 个正确答案
4. 干扰项应为学生常见错误答案，具有迷惑性
5. 计算结果必须正确
6. 每题序号从 ${seqStr} 开始，格式为 "${kp.id}-c${seqStr}"
7. 题目和选项内容均不得使用 LaTeX 语法，用普通字符表达数学（如 3/4、75%、3²写作 3^2 或 3的平方）

请严格按以下 JSON 格式输出（只输出 JSON 数组，不要有任何其他文字、不要有 markdown 代码块）：
[
  {
    "id": "${kp.id}-c${seqStr}",
    "kp_id": "${kp.id}",
    "kp_name": "${kp.name}",
    "grade": "${kp.gradeName}",
    "semester": "${kp.unitSemester}学期",
    "difficulty": "easy",
    "type": "choice",
    "question": "题目正文",
    "blanks": [],
    "choices": [
      { "label": "A", "content": "选项内容" },
      { "label": "B", "content": "选项内容" },
      { "label": "C", "content": "选项内容" },
      { "label": "D", "content": "选项内容" }
    ],
    "correctChoice": "A",
    "solution": "完整解题过程",
    "common_mistake": "学生常见的错误",
    "hint": "解题提示"
  }
]`;
  }

  // mixed
  return `你是一位专业的小学数学教师，请为以下知识点出 ${count} 道综合题。
综合题 = 先选择正确选项，再填写计算过程或结果（两步作答）。

${kpHeader}

要求：
1. 每道题只考察本知识点，不超出小学范围
2. 难度分布：简单、中等、困难合理分配，共 ${count} 道
3. 每题分两步：第一步选择（4选1），第二步填空（用 ____ 表示，1-2个空）
4. 例如："选出正确的算式，并写出计算结果"
5. 计算结果必须正确
6. 每题序号从 ${seqStr} 开始，格式为 "${kp.id}-m${seqStr}"
7. 【重要】blanks 中的填空答案只能是整数、小数、百分数、分数（3/4格式），不含数学符号
8. 题目和选项内容均不得使用 LaTeX 语法，用普通字符表达数学

请严格按以下 JSON 格式输出（只输出 JSON 数组，不要有任何其他文字、不要有 markdown 代码块）：
[
  {
    "id": "${kp.id}-m${seqStr}",
    "kp_id": "${kp.id}",
    "kp_name": "${kp.name}",
    "grade": "${kp.gradeName}",
    "semester": "${kp.unitSemester}学期",
    "difficulty": "easy",
    "type": "mixed",
    "question": "题目正文，____ 表示填空处",
    "blanks": ["填空答案"],
    "choices": [
      { "label": "A", "content": "选项内容" },
      { "label": "B", "content": "选项内容" },
      { "label": "C", "content": "选项内容" },
      { "label": "D", "content": "选项内容" }
    ],
    "correctChoice": "A",
    "solution": "完整解题过程",
    "common_mistake": "学生常见的错误",
    "hint": "解题提示"
  }
]`;
}

// ─── 校验 ─────────────────────────────────────────────────────────────────────

function validateQuestion(q: unknown): q is Question {
  if (!isJsonObject(q)) return false;

  const question = q.question;
  const baseValid = (
    typeof q.id === 'string' &&
    typeof q.kp_id === 'string' &&
    typeof q.difficulty === 'string' &&
    ['easy', 'medium', 'hard'].includes(q.difficulty) &&
    typeof question === 'string' &&
    typeof q.solution === 'string'
  );
  if (!baseValid) return false;

  const qType = q.type || 'fill_blank';

  if (qType === 'fill_blank') {
    return question.includes('____') && Array.isArray(q.blanks) && q.blanks.length > 0;
  }

  if (qType === 'choice') {
    return (
      Array.isArray(q.choices) && q.choices.length >= 2 &&
      typeof q.correctChoice === 'string' &&
      q.choices.some(choice => isJsonObject(choice) && choice.label === q.correctChoice)
    );
  }

  if (qType === 'mixed') {
    return (
      question.includes('____') &&
      Array.isArray(q.blanks) && q.blanks.length > 0 &&
      Array.isArray(q.choices) && q.choices.length >= 2 &&
      typeof q.correctChoice === 'string'
    );
  }

  // 存量题无 type 字段，按填空题校验
  return question.includes('____') && Array.isArray(q.blanks) && q.blanks.length > 0;
}

// ─── 单次 API 调用（含重试）────────────────────────────────────────────────────

async function generateBatch(
  kp: KPMeta,
  genType: 'fill_blank' | 'choice' | 'mixed',
  count: number,
  label: string,
): Promise<Question[]> {
  const startSeq = APPEND_MODE ? getNextSeqNum(kp.id, genType) : 1;
  const prompt = buildPrompt(kp, genType, count, startSeq);

  if (DRY_RUN) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[dry-run] ${label} | ${genType} x${count}`);
    console.log(prompt);
    return [];
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      const delayMs = Math.pow(2, attempt - 1) * 1000;
      console.log(`    🔄 ${genType} 第 ${attempt}/${MAX_RETRIES} 次重试，等待 ${delayMs / 1000}s…`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      const response = await client!.chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const raw = response.choices[0]?.message?.content ?? '';

      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error(`返回内容不含 JSON 数组（前200字）:\n${raw.slice(0, 200)}`);
      }

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error('解析结果不是数组');

      const valid: Question[] = [];
      const parsedItems: unknown[] = parsed;
      parsedItems.forEach((candidate, i) => {
        // 确保 type 字段存在
        if (isJsonObject(candidate) && !candidate.type) candidate.type = genType;
        if (!validateQuestion(candidate)) {
          console.warn(`    ⚠️  ${genType} 第 ${i + 1} 题格式不完整，跳过`);
          return;
        }
        valid.push(candidate);
      });

      if (valid.length === 0) throw new Error('所有题目均格式不完整');

      console.log(`    ✅ ${genType} 成功 ${valid.length} 道${attempt > 1 ? `（第 ${attempt} 次）` : ''}`);
      return valid;

    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        console.warn(`    ⚠️  ${genType} 第 ${attempt} 次失败: ${err}`);
      }
    }
  }

  throw lastError;
}

async function generateForKP(kp: KPMeta, index: number, total: number): Promise<Question[]> {
  const historyAttempts = progress.failed[kp.id]?.totalAttempts ?? 0;
  const attemptLabel = historyAttempts > 0 ? `（历史已失败 ${historyAttempts} 次）` : '';
  const plans = getGenPlans(kp);
  const planDesc = plans.map(p => `${p.type}x${p.count}`).join('+');

  console.log(`[${index}/${total}] ${kp.id} ${kp.name} [${planDesc}]${attemptLabel}`);

  const allQuestions: Question[] = [];

  for (const plan of plans) {
    const label = `${kp.id} ${kp.name}`;
    const batch = await generateBatch(kp, plan.type, plan.count, label);
    allQuestions.push(...batch);
  }

  return allQuestions;
}

// ─── 主循环（支持并发）────────────────────────────────────────────────────────

async function main() {
  const results: Question[] = [...existingQuestions];
  let successCount = 0;
  let failCount = 0;

  // 将待处理 KP 切分为批次，每批 CONCURRENCY 个并发执行
  for (let batchStart = 0; batchStart < pendingKPs.length; batchStart += CONCURRENCY) {
    const batch = pendingKPs.slice(batchStart, batchStart + CONCURRENCY);

    const batchSettled = await Promise.allSettled(
      batch.map((kp, j) => {
        const idx = batchStart + j + 1;
        return generateForKP(kp, idx, pendingKPs.length);
      }),
    );

    // 处理批次结果，按完成顺序追加（保持确定性顺序）
    for (let j = 0; j < batch.length; j++) {
      const kp = batch[j];
      const settled = batchSettled[j];
      if (settled.status === 'fulfilled') {
        const newQuestions = settled.value;
        if (newQuestions.length > 0) {
          results.push(...newQuestions);
          successCount++;

          delete progress.failed[kp.id];
          if (!progress.succeeded.includes(kp.id)) {
            progress.succeeded.push(kp.id);
          }
        }
      } else {
        failCount++;
        const err = settled.reason;
        const errorMsg = String(err);
        const prev = progress.failed[kp.id];
        progress.failed[kp.id] = {
          totalAttempts: (prev?.totalAttempts ?? 0) + MAX_RETRIES,
          lastError: errorMsg.slice(0, 200),
          lastAttemptAt: new Date().toISOString(),
        };
        const logLine = `[${new Date().toISOString()}] ${kp.id} ${kp.name}: ${err}\n`;
        console.error(`  ❌ 全部 ${MAX_RETRIES} 次尝试均失败: ${err}`);
        fs.appendFileSync(ERROR_LOG, logLine);
      }
    }

    // 每批结束后统一写入文件（减少 IO 次数）
    if (!DRY_RUN) {
      fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(results, null, 2), 'utf-8');
      saveProgress(progress);
    }

    // 批次间间隔（最后一批不等待）
    if (!DRY_RUN && batchStart + CONCURRENCY < pendingKPs.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (!DRY_RUN) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  🎉 本次运行完成`);
    console.log(`     成功: ${successCount} 个知识点`);
    console.log(`     失败: ${failCount} 个知识点${failCount > 0 ? '（下次运行将自动重试）' : ''}`);
    console.log(`  📁 题目已写入: ${QUESTIONS_PATH}`);
    console.log(`  📊 进度已记录: ${PROGRESS_PATH}`);
    if (failCount > 0) {
      console.log(`  ⚠️  错误详情:   ${ERROR_LOG}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
