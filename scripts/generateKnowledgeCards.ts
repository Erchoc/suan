// scripts/generateKnowledgeCards.ts
/**
 * Generates knowledge cards (explanation + FAQs) for knowledge points in bulk.
 *
 * Usage:
 *   pnpm run gen:cards              # Generate every missing knowledge card.
 *   pnpm run gen:cards --grade 5    # Generate cards for grade 5 only.
 *   pnpm run gen:cards --kp 5-18    # Generate a card for one knowledge point.
 *   pnpm run gen:cards --dry-run    # Print the prompt without calling the API.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAIConfig, requestAIText } from './aiText.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GRAPH_PATH = path.join(ROOT, 'src/data/knowledge-graph.json');
const CARDS_PATH = path.join(ROOT, 'src/data/knowledge-cards.json');
const ERROR_LOG = path.join(ROOT, 'gen-cards-errors.log');

type JsonObject = Record<string, unknown>;

interface KPRaw {
  id: string;
  name: string;
}

interface UnitRaw {
  semester: string;
  kps: KPRaw[];
}

interface DomainRaw {
  name: string;
  units: UnitRaw[];
}

interface GradeRaw {
  name: string;
  domains: DomainRaw[];
}

interface GraphData {
  grades: GradeRaw[];
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKPRaw(value: unknown): value is KPRaw {
  return isJsonObject(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isUnitRaw(value: unknown): value is UnitRaw {
  return (
    isJsonObject(value) &&
    typeof value.semester === 'string' &&
    Array.isArray(value.kps) &&
    value.kps.every(isKPRaw)
  );
}

function isDomainRaw(value: unknown): value is DomainRaw {
  return (
    isJsonObject(value) &&
    typeof value.name === 'string' &&
    Array.isArray(value.units) &&
    value.units.every(isUnitRaw)
  );
}

function isGradeRaw(value: unknown): value is GradeRaw {
  return (
    isJsonObject(value) &&
    typeof value.name === 'string' &&
    Array.isArray(value.domains) &&
    value.domains.every(isDomainRaw)
  );
}

function isGraphData(value: unknown): value is GraphData {
  return isJsonObject(value) && Array.isArray(value.grades) && value.grades.every(isGradeRaw);
}

function parseJsonObjectArray(source: string, label: string): JsonObject[] {
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);

  const items: unknown[] = parsed;
  if (!items.every(isJsonObject)) throw new Error(`${label} entries must be objects`);
  return items;
}

// CLI argument parsing
const args = process.argv.slice(2);
const gradeFilter = args.includes('--grade') ? Number(args[args.indexOf('--grade') + 1]) : null;
const kpFilter = args.includes('--kp') ? args[args.indexOf('--kp') + 1] : null;
const dryRun = args.includes('--dry-run');

// Data loading
const graphValue: unknown = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
if (!isGraphData(graphValue)) throw new Error('Invalid knowledge graph data');
const graph = graphValue;

const existingCards: JsonObject[] = fs.existsSync(CARDS_PATH)
  ? parseJsonObjectArray(fs.readFileSync(CARDS_PATH, 'utf-8'), 'Knowledge card data')
  : [];
const existingKpIds = new Set(existingCards.map(card => card.kp_id));

// Collect target knowledge points
interface TargetKP {
  id: string;
  name: string;
  gradeNum: number;
  gradeName: string;
  semester: string;
  domainName: string;
}

const targets: TargetKP[] = [];
graph.grades.forEach((grade, gi) => {
  const gradeNum = gi + 1;
  if (gradeFilter && gradeNum !== gradeFilter) return;
  grade.domains.forEach(domain => {
    domain.units.forEach(unit => {
      unit.kps.forEach(kp => {
        if (kpFilter && kp.id !== kpFilter) return;
        if (existingKpIds.has(kp.id)) return; // Skip generated cards when resuming.
        targets.push({
          id: kp.id,
          name: kp.name,
          gradeNum,
          gradeName: grade.name,
          semester: unit.semester,
          domainName: domain.name,
        });
      });
    });
  });
});

console.log(
  `Target knowledge points: ${targets.length} (${existingKpIds.size} existing records skipped)\n`,
);
if (targets.length === 0) {
  console.log('No knowledge cards need to be generated.');
  process.exit(0);
}

// Prompt construction
function buildPrompt(kp: TargetKP): string {
  return `你是一位经验丰富的小学数学老师，擅长用简单易懂的语言讲解数学概念。

请为以下知识点生成一张「知识卡」，内容面向${kp.gradeName}${kp.semester}学期的学生。

知识点：${kp.name}
所属领域：${kp.domainName}
年级：${kp.gradeName}（第 ${kp.gradeNum} 学年）

请生成以下内容（JSON 格式）：
1. explanation（string，Markdown 格式，200-500字）：
   - 先用一两句话说清楚核心概念
   - 再给出 1-2 个具体例题和分步解析
   - 最后给一个小技巧或常见注意点
   - 重要：使用普通字符表达数学，不要使用 LaTeX。分数用 a/b 表示（如 3/4），平方用 a² 表示，乘法用 × 表示
   - 重要：填空题的答案必须是学生能用普通键盘输入的内容（数字、小数、分数如3/4）

2. faqs（数组，3条）：
   - 每条包含 question（string）和 answer（string，50-100字）
   - 选择这个年龄段学生最容易困惑的 3 个问题
   - answer 用简单易懂的语言解释

请严格按照以下 JSON 格式输出，不要有任何额外文字：
{
  "explanation": "...",
  "faqs": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}`;
}

// AI configuration
const AI_CONFIG = readAIConfig(process.env);
if (!dryRun && !AI_CONFIG.apiKey) {
  console.error('Set the API_KEY environment variable');
  process.exit(1);
}

async function callAI(prompt: string): Promise<string> {
  return requestAIText({
    config: AI_CONFIG,
    prompt,
    temperature: 0.7,
  });
}

// Main loop
const cards = [...existingCards];

for (let i = 0; i < targets.length; i++) {
  const kp = targets[i];
  console.log(`[${i + 1}/${targets.length}] ${kp.gradeName} · ${kp.name} (${kp.id})`);

  const prompt = buildPrompt(kp);

  if (dryRun) {
    console.log('--- Prompt ---');
    console.log(prompt);
    console.log('--- End ---\n');
    continue;
  }

  try {
    const raw = await callAI(prompt);

    // Extract JSON even if the model adds surrounding text.
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Response cannot be parsed as JSON: ${raw.slice(0, 200)}`);

    const parsed: unknown = JSON.parse(jsonMatch[0]);

    // Validate fields.
    if (!isJsonObject(parsed) || !parsed.explanation || typeof parsed.explanation !== 'string') {
      throw new Error('explanation is missing or is not a string');
    }
    if (!Array.isArray(parsed.faqs) || parsed.faqs.length < 2) {
      throw new Error('faqs is missing or has fewer than two entries');
    }

    const card = {
      kp_id: kp.id,
      explanation: parsed.explanation,
      faqs: parsed.faqs,
      textbook_ref: undefined as string | undefined,
      meta: {
        generated_at: new Date().toISOString(),
        model: AI_CONFIG.model,
        reviewed: false,
      },
    };

    cards.push(card);
    fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2), 'utf-8');
    console.log('  Generated and saved\n');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const msg = `[${kp.id}] ${kp.name}: ${errorMessage}`;
    console.error(`  Failed: ${msg}\n`);
    fs.appendFileSync(ERROR_LOG, `${new Date().toISOString()} ${msg}\n`);
  }
}

if (!dryRun) {
  console.log(`\nDone. Generated ${cards.length - existingCards.length} knowledge cards.`);
  if (fs.existsSync(ERROR_LOG)) {
    console.log(`Failure log: ${ERROR_LOG}`);
  }
}
