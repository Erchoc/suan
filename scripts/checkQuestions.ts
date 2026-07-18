/**
 * Question quality validation script.
 *
 * Usage: pnpm run check:questions [--grade N] [--kp ID] [--limit N] [--dry-run] [--force]
 *
 * Workflow:
 *   1. Read public/questions.json.
 *   2. Skip validated questions by default; --force validates everything again.
 *   3. Send each question to an LLM for quality review.
 *   4. Set enable=false and write checkMessage for invalid questions.
 *   5. Set enable=true and clear checkMessage for valid questions.
 *   6. Resume by skipping questions that already have an enable field.
 *
 * Options:
 *   --grade N    Validate only grade N.
 *   --kp ID      Validate only one knowledge point.
 *   --start ID   Resume at the specified question ID, inclusive.
 *   --limit N    Validate at most N questions; defaults to all.
 *   --batch N    Send N questions per batch; defaults to 5.
 *   --force      Ignore enable and validate everything from the beginning.
 *   --dry-run    Print prompts without calling the API.
 *
 * Environment variables:
 *   API_KEY      - Provider API key.
 *   BASE_URL     - Provider base URL; defaults to https://api.deepseek.com.
 *   MODEL        - Model name; defaults to deepseek-v4-flash.
 *   AI_PROTOCOL  - openai-chat, openai-coding, or anthropic; defaults to openai-chat.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAIConfig, requestAIText } from './aiText.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_PATH = path.join(ROOT, 'public/questions.json');

// Types

interface Choice {
  label: string;
  content: string;
}

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

// Argument parsing

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};
const hasFlag = (flag: string) => args.includes(flag);

const GRADE_FILTER = getArg('--grade') ? parseInt(getArg('--grade')!, 10) : null;
const KP_FILTER = getArg('--kp');
const START_ID = getArg('--start');
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit')!, 10) : Infinity;
const BATCH_SIZE = getArg('--batch') ? parseInt(getArg('--batch')!, 10) : 5;
const FORCE = hasFlag('--force');
const DRY_RUN = hasFlag('--dry-run');

// AI configuration

const AI_CONFIG = readAIConfig(process.env);

if (!DRY_RUN) {
  if (!AI_CONFIG.apiKey) {
    console.error('❌ Set the API_KEY environment variable');
    process.exit(1);
  }
}

// Data loading

if (!fs.existsSync(QUESTIONS_PATH)) {
  console.error('❌ public/questions.json was not found');
  process.exit(1);
}

const allQuestions: Question[] = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));

// Select questions to validate

// --force validates every question; the default processes only questions with enable === undefined.
let pending = FORCE ? [...allQuestions] : allQuestions.filter(q => q.enable === undefined);

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
    console.error(`❌ Question ID "${START_ID}" was not found`);
    process.exit(1);
  }
  console.log(`⏩ --start ${START_ID}: skipped ${startIdx} questions; resuming at ${startIdx + 1}`);
  pending = pending.slice(startIdx);
}

pending = pending.slice(0, LIMIT);

const alreadyChecked = allQuestions.filter(q => q.enable !== undefined).length;

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  📊 Total questions:   ${allQuestions.length}`);
console.log(`     Validated:         ${alreadyChecked}`);
console.log(`     Pending:           ${pending.length}${FORCE ? ' (--force all)' : ''}`);
console.log(`     Batch size:        ${BATCH_SIZE}`);
if (START_ID) console.log(`     Resume from:       ${START_ID}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (pending.length === 0) {
  console.log('✅ Every question has already been validated');
  process.exit(0);
}

if (!DRY_RUN) {
  console.log(`🔗 Base URL: ${AI_CONFIG.baseUrl}`);
  console.log(`🔌 Protocol: ${AI_CONFIG.protocol}`);
  console.log(`🤖 Model: ${AI_CONFIG.model}\n`);
}

// Prompt construction

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

// Validate one batch

async function checkBatch(
  batch: Question[],
  batchNum: number,
  totalBatches: number,
): Promise<CheckResult[]> {
  const prompt = buildCheckPrompt(batch);
  const ids = batch.map(q => q.id).join(', ');

  if (DRY_RUN) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[dry-run] Batch ${batchNum}/${totalBatches} (${batch.length} questions): ${ids}`);
    console.log(`${prompt.slice(0, 500)}\n...(truncated)`);
    return [];
  }

  console.log(`  [${batchNum}/${totalBatches}] Validating: ${ids}`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      const delay = 2 ** (attempt - 1) * 1000;
      console.log(`    🔄 Retry ${attempt}/3 after ${delay / 1000}s…`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const raw = await requestAIText({
        config: AI_CONFIG,
        prompt,
        temperature: 0.1,
      });
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch)
        throw new Error(`Response does not contain a JSON array:\n${raw.slice(0, 200)}`);

      const parsed: CheckResult[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error('Parsed result is not an array');

      const validResults = parsed.filter(
        r => typeof r.id === 'string' && ['ok', 'error'].includes(r.status),
      );

      if (validResults.length === 0) throw new Error('No valid validation results');

      return validResults;
    } catch (err) {
      if (attempt === 3) {
        console.error(`    ❌ Batch ${batchNum} failed after all retries: ${err}`);
        return [];
      }
      console.warn(`    ⚠️  Attempt ${attempt} failed: ${err}`);
    }
  }

  return [];
}

// Main flow

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
        console.log(`    ✅ ${q.id} ${q.kp_name} — valid`);
      } else {
        allQuestions[idx].enable = false;
        allQuestions[idx].checkMessage = result.reason ?? '未知原因';
        errorCount++;
        console.log(`    ❌ ${q.id} ${q.kp_name} — ${allQuestions[idx].checkMessage}`);
      }
    }

    // Persist after each completed batch.
    fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(allQuestions, null, 2), 'utf-8');

    if (!DRY_RUN && bi < batches.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(
    [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '  🎉 Validation complete',
      `     Valid:    ${okCount} (enable=true)`,
      `     Invalid:  ${errorCount} (enable=false)`,
      `     Skipped:  ${skipCount} (no API result)`,
      `  📁 Updated: ${QUESTIONS_PATH}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ].join('\n'),
  );
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
