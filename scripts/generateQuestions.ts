/**
 * Bulk question generation script.
 * Usage: pnpm run gen:questions [--grade N] [--kp ID] [--type MODE] [--concurrency N] [--append] [--dry-run]
 *
 * Options:
 *   --grade N         Generate questions for grade N only.
 *   --kp ID           Generate questions for one knowledge point only.
 *   --type MODE       fill_blank | choice | half | auto (default, based on grade).
 *   --concurrency N   Concurrent requests; defaults to 1 and should stay below 5.
 *   --append          Append questions even when the knowledge point already has content.
 *   --dry-run         Print prompts without calling the API.
 *
 * Question modes:
 *   fill_blank  - Fill-in-the-blank questions only.
 *   choice      - Multiple-choice questions only.
 *   half        - Five choice and five fill-in-the-blank questions.
 *   auto        - Grades 1-3: 5 choice, 3 blank, 2 mixed; grades 4-6: 3 choice, 5 blank, 2 mixed.
 *
 * Required environment variables:
 *   API_KEY      - Provider API key.
 *   BASE_URL     - Provider base URL; defaults to https://api.deepseek.com.
 *   MODEL        - Model name; defaults to deepseek-v4-flash.
 *   AI_PROTOCOL  - openai-chat, openai-coding, or anthropic; defaults to openai-chat.
 *
 * Progress files:
 *   gen-progress.json  - Status and attempt counts for each knowledge point.
 *   questions.json     - Canonical question data, updated after each success.
 *   gen-errors.log     - Failure details.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAIConfig, requestAIText } from './aiText.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GRAPH_PATH = path.join(ROOT, 'src/data/knowledge-graph.json');
const QUESTIONS_PATH = path.join(ROOT, 'public/questions.json');
const LOGS_DIR = path.join(ROOT, 'logs');
const PROGRESS_PATH = path.join(ROOT, 'gen-progress.json');
const ERROR_LOG = path.join(LOGS_DIR, 'gen-errors.log');

const MAX_RETRIES = 3;

// Types

interface Choice {
  label: string;
  content: string;
}

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface KPRaw {
  id: string;
  name: string;
  deps: string[];
}
interface UnitRaw {
  id: string;
  name: string;
  semester: string;
  kps: KPRaw[];
}
interface DomainRaw {
  id: string;
  name: string;
  icon: string;
  units: UnitRaw[];
}
interface GradeRaw {
  id: string;
  name: string;
  color: string;
  domains: DomainRaw[];
}
interface GraphData {
  meta: { bridgePoints: { groups: { kpIds: string[] }[] } };
  grades: GradeRaw[];
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
}

interface KPMeta {
  id: string;
  name: string;
  deps: string[];
  gradeName: string;
  gradeNum: number;
  unitSemester: string;
  unitName: string;
  domainName: string;
  isBridge: boolean;
}

type TypeMode = 'fill_blank' | 'choice' | 'half' | 'auto';

// Progress tracking

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
      console.warn('⚠️  Failed to parse gen-progress.json; rebuilding it');
    }
  }
  return { updatedAt: '', succeeded: [], failed: {} };
}

function saveProgress(progress: ProgressData) {
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf-8');
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
const DRY_RUN = hasFlag('--dry-run');
const APPEND_MODE = hasFlag('--append');
const TYPE_MODE = (getArg('--type') ?? 'auto') as TypeMode;
const CONCURRENCY = Math.max(1, parseInt(getArg('--concurrency') ?? '1', 10));

if (!['fill_blank', 'choice', 'half', 'auto'].includes(TYPE_MODE)) {
  console.error('❌ Invalid --type value; choose fill_blank, choice, half, or auto');
  process.exit(1);
}

// AI configuration

const AI_CONFIG = readAIConfig(process.env);

if (!DRY_RUN) {
  if (!AI_CONFIG.apiKey) {
    console.error('❌ Set the API_KEY environment variable');
    process.exit(1);
  }
}

// Ensure the logs directory exists.
fs.mkdirSync(LOGS_DIR, { recursive: true });

// Data loading

const graphData: GraphData = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));

const bridgeSet = new Set<string>();
graphData.meta.bridgePoints.groups.forEach(g => g.kpIds.forEach(id => bridgeSet.add(id)));

const allKPs: KPMeta[] = [];
graphData.grades.forEach((grade, gi) => {
  grade.domains.forEach(domain => {
    domain.units.forEach(unit => {
      unit.kps.forEach(kp => {
        allKPs.push({
          id: kp.id,
          name: kp.name,
          deps: kp.deps,
          gradeName: grade.name,
          gradeNum: gi + 1,
          unitSemester: unit.semester,
          unitName: unit.name,
          domainName: domain.name,
          isBridge: bridgeSet.has(kp.id),
        });
      });
    });
  });
});

// Select targets

let targetKPs = allKPs;
if (KP_FILTER) {
  targetKPs = allKPs.filter(k => k.id === KP_FILTER);
  if (targetKPs.length === 0) {
    console.error(`❌ Knowledge point ${KP_FILTER} was not found`);
    process.exit(1);
  }
} else if (GRADE_FILTER) {
  targetKPs = allKPs.filter(k => k.gradeNum === GRADE_FILTER);
}

// Load existing questions and resumable progress

let existingQuestions: Question[] = [];
if (fs.existsSync(QUESTIONS_PATH)) {
  existingQuestions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));
}
const doneKPIds = new Set(existingQuestions.map(q => q.kp_id));

const progress = loadProgress();
const historyFailedIds = Object.keys(progress.failed);
const historyFailedInScope = historyFailedIds.filter(id => targetKPs.some(k => k.id === id));

// Append mode keeps existing knowledge points; normal mode skips them when resuming.
const pendingKPs = APPEND_MODE ? targetKPs : targetKPs.filter(k => !doneKPIds.has(k.id));

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  📊 Previous progress (gen-progress.json)');
console.log(`     Succeeded: ${progress.succeeded.length} knowledge points`);
if (historyFailedInScope.length > 0) {
  console.log(`     Failed: ${historyFailedInScope.length} (retrying now)`);
  historyFailedInScope.forEach(id => {
    const entry = progress.failed[id];
    const kp = allKPs.find(k => k.id === id);
    console.log(
      `       - ${id} ${kp?.name ?? ''} | ${entry.totalAttempts} attempts | Last error: ${entry.lastError.slice(0, 60)}`,
    );
  });
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  📚 Target knowledge points: ${targetKPs.length}`);
console.log(`     Complete: ${doneKPIds.size} already in questions.json`);
console.log(
  `     Pending:  ${pendingKPs.length}${historyFailedInScope.length > 0 ? ` including ${historyFailedInScope.length} retries` : ''}`,
);
console.log(`  📝 Question mode: ${TYPE_MODE}`);
console.log(`  ⚡ Concurrency: ${CONCURRENCY}`);
if (APPEND_MODE) console.log('  ➕ Append mode: adding questions to existing knowledge points');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (!DRY_RUN) {
  console.log(`🔗 Base URL: ${AI_CONFIG.baseUrl}`);
  console.log(`🔌 Protocol: ${AI_CONFIG.protocol}`);
  console.log(`🤖 Model: ${AI_CONFIG.model}\n`);
}

if (pendingKPs.length === 0) {
  console.log('✅ Every knowledge point already has questions');
  process.exit(0);
}

// Build a generation plan for each knowledge point from --type and grade

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
        // Grades 1-3: five choice, three fill-in-the-blank, and two mixed questions.
        return [
          { type: 'choice', count: 5 },
          { type: 'fill_blank', count: 3 },
          { type: 'mixed', count: 2 },
        ];
      } else {
        // Grades 4-6: three choice, five fill-in-the-blank, and two mixed questions.
        return [
          { type: 'choice', count: 3 },
          { type: 'fill_blank', count: 5 },
          { type: 'mixed', count: 2 },
        ];
      }
  }
}

// Prompt construction

// Find the highest existing sequence number for a knowledge point and question type.
function getNextSeqNum(kpId: string, genType: 'fill_blank' | 'choice' | 'mixed'): number {
  const prefix =
    genType === 'fill_blank' ? `${kpId}-` : genType === 'choice' ? `${kpId}-c` : `${kpId}-m`;
  let max = 0;
  existingQuestions.forEach(q => {
    if (q.id.startsWith(prefix)) {
      const suffix = q.id.slice(prefix.length);
      const num = parseInt(suffix, 10);
      if (!Number.isNaN(num) && num > max) max = num;
    }
  });
  return max + 1;
}

function buildPrompt(
  kp: KPMeta,
  genType: 'fill_blank' | 'choice' | 'mixed',
  count: number,
  startSeq: number,
): string {
  const depsDesc = kp.deps.length > 0 ? `\n前置知识点：${kp.deps.join('、')}` : '';
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

// Validation

function validateQuestion(q: unknown): q is Question {
  if (!isJsonObject(q)) return false;

  const question = q.question;
  const baseValid =
    typeof q.id === 'string' &&
    typeof q.kp_id === 'string' &&
    typeof q.difficulty === 'string' &&
    ['easy', 'medium', 'hard'].includes(q.difficulty) &&
    typeof question === 'string' &&
    typeof q.solution === 'string';
  if (!baseValid) return false;

  const qType = q.type || 'fill_blank';

  if (qType === 'fill_blank') {
    return question.includes('____') && Array.isArray(q.blanks) && q.blanks.length > 0;
  }

  if (qType === 'choice') {
    return (
      Array.isArray(q.choices) &&
      q.choices.length >= 2 &&
      typeof q.correctChoice === 'string' &&
      q.choices.some(choice => isJsonObject(choice) && choice.label === q.correctChoice)
    );
  }

  if (qType === 'mixed') {
    return (
      question.includes('____') &&
      Array.isArray(q.blanks) &&
      q.blanks.length > 0 &&
      Array.isArray(q.choices) &&
      q.choices.length >= 2 &&
      typeof q.correctChoice === 'string'
    );
  }

  // Validate legacy questions without type as fill-in-the-blank questions.
  return question.includes('____') && Array.isArray(q.blanks) && q.blanks.length > 0;
}

// One API request with retries

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
      const delayMs = 2 ** (attempt - 1) * 1000;
      console.log(`    🔄 ${genType} retry ${attempt}/${MAX_RETRIES} after ${delayMs / 1000}s…`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      const raw = await requestAIText({
        config: AI_CONFIG,
        prompt,
        temperature: 0.7,
      });

      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error(
          `Response does not contain a JSON array (first 200 characters):\n${raw.slice(0, 200)}`,
        );
      }

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error('Parsed result is not an array');

      const valid: Question[] = [];
      const parsedItems: unknown[] = parsed;
      parsedItems.forEach((candidate, i) => {
        // Ensure the type field exists.
        if (isJsonObject(candidate) && !candidate.type) candidate.type = genType;
        if (!validateQuestion(candidate)) {
          console.warn(`    ⚠️  Skipping malformed ${genType} question ${i + 1}`);
          return;
        }
        valid.push(candidate);
      });

      if (valid.length === 0) throw new Error('Every generated question is malformed');

      console.log(
        `    ✅ Generated ${valid.length} ${genType} questions${attempt > 1 ? ` on attempt ${attempt}` : ''}`,
      );
      return valid;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        console.warn(`    ⚠️  ${genType} attempt ${attempt} failed: ${err}`);
      }
    }
  }

  throw lastError;
}

async function generateForKP(kp: KPMeta, index: number, total: number): Promise<Question[]> {
  const historyAttempts = progress.failed[kp.id]?.totalAttempts ?? 0;
  const attemptLabel = historyAttempts > 0 ? ` (${historyAttempts} previous failures)` : '';
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

// Concurrent main loop

async function main() {
  const results: Question[] = [...existingQuestions];
  let successCount = 0;
  let failCount = 0;

  // Split pending knowledge points into batches of CONCURRENCY parallel tasks.
  for (let batchStart = 0; batchStart < pendingKPs.length; batchStart += CONCURRENCY) {
    const batch = pendingKPs.slice(batchStart, batchStart + CONCURRENCY);

    const batchSettled = await Promise.allSettled(
      batch.map((kp, j) => {
        const idx = batchStart + j + 1;
        return generateForKP(kp, idx, pendingKPs.length);
      }),
    );

    // Append batch results in completion order to keep output deterministic.
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
        console.error(`  ❌ Failed after all ${MAX_RETRIES} attempts: ${err}`);
        fs.appendFileSync(ERROR_LOG, logLine);
      }
    }

    // Write once after each batch to reduce I/O.
    if (!DRY_RUN) {
      fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(results, null, 2), 'utf-8');
      saveProgress(progress);
    }

    // Wait between batches except after the final batch.
    if (!DRY_RUN && batchStart + CONCURRENCY < pendingKPs.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (!DRY_RUN) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🎉 Run complete');
    console.log(`     Succeeded: ${successCount} knowledge points`);
    console.log(
      `     Failed: ${failCount} knowledge points${failCount > 0 ? ' (will retry next run)' : ''}`,
    );
    console.log(`  📁 Questions written to: ${QUESTIONS_PATH}`);
    console.log(`  📊 Progress written to: ${PROGRESS_PATH}`);
    if (failCount > 0) {
      console.log(`  ⚠️  Error details: ${ERROR_LOG}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
