// scripts/generateKnowledgeCards.ts
/**
 * 批量为知识点生成知识卡（explanation + faqs）
 *
 * 用法：
 *   pnpm run gen:cards              # 生成全部未生成的知识点
 *   pnpm run gen:cards --grade 5    # 只生成五年级
 *   pnpm run gen:cards --kp 5-18   # 只生成指定知识点
 *   pnpm run gen:cards --dry-run   # 仅打印 Prompt，不调用 API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  return isJsonObject(value) &&
    typeof value.semester === 'string' &&
    Array.isArray(value.kps) &&
    value.kps.every(isKPRaw);
}

function isDomainRaw(value: unknown): value is DomainRaw {
  return isJsonObject(value) &&
    typeof value.name === 'string' &&
    Array.isArray(value.units) &&
    value.units.every(isUnitRaw);
}

function isGradeRaw(value: unknown): value is GradeRaw {
  return isJsonObject(value) &&
    typeof value.name === 'string' &&
    Array.isArray(value.domains) &&
    value.domains.every(isDomainRaw);
}

function isGraphData(value: unknown): value is GraphData {
  return isJsonObject(value) && Array.isArray(value.grades) && value.grades.every(isGradeRaw);
}

function parseJsonObjectArray(source: string, label: string): JsonObject[] {
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed)) throw new Error(`${label} 必须是 JSON 数组`);

  const items: unknown[] = parsed;
  if (!items.every(isJsonObject)) throw new Error(`${label} 数组元素必须是对象`);
  return items;
}

// ─── CLI 参数解析 ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const gradeFilter = args.includes('--grade') ? Number(args[args.indexOf('--grade') + 1]) : null;
const kpFilter    = args.includes('--kp')    ? args[args.indexOf('--kp') + 1]            : null;
const dryRun      = args.includes('--dry-run');

// ─── 数据加载 ────────────────────────────────────────────────────────────────
const graphValue: unknown = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
if (!isGraphData(graphValue)) throw new Error('知识图谱数据格式无效');
const graph = graphValue;

const existingCards: JsonObject[] = fs.existsSync(CARDS_PATH)
  ? parseJsonObjectArray(fs.readFileSync(CARDS_PATH, 'utf-8'), '知识卡数据')
  : [];
const existingKpIds = new Set(existingCards.map(card => card.kp_id));

// ─── 收集目标知识点 ──────────────────────────────────────────────────────────
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
        if (existingKpIds.has(kp.id)) return; // 断点续跑：跳过已生成的
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

console.log(`目标知识点：${targets.length} 个（已跳过 ${existingKpIds.size} 个已有记录）\n`);
if (targets.length === 0) {
  console.log('没有需要生成的知识点，退出。');
  process.exit(0);
}

// ─── Prompt 构造 ─────────────────────────────────────────────────────────────
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

// ─── API 调用 ────────────────────────────────────────────────────────────────
const AI_BASE_URL = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
const AI_API_KEY  = process.env.AI_API_KEY  ?? '';
const AI_MODEL    = process.env.AI_MODEL    ?? 'gpt-4o-mini';

async function callAI(prompt: string): Promise<string> {
  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`API 请求失败：${res.status} ${await res.text()}`);
  const json: unknown = await res.json();
  if (!isJsonObject(json) || !Array.isArray(json.choices)) {
    throw new Error('API 返回格式无效：缺少 choices 数组');
  }
  const firstChoice: unknown = json.choices[0];
  if (!isJsonObject(firstChoice) || !isJsonObject(firstChoice.message) || typeof firstChoice.message.content !== 'string') {
    throw new Error('API 返回格式无效：缺少消息内容');
  }
  return firstChoice.message.content;
}

// ─── 主循环 ─────────────────────────────────────────────────────────────────
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

    // 提取 JSON（防止 AI 多输出文字）
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`返回内容无法解析为 JSON：${raw.slice(0, 200)}`);

    const parsed: unknown = JSON.parse(jsonMatch[0]);

    // 字段校验
    if (!isJsonObject(parsed) || !parsed.explanation || typeof parsed.explanation !== 'string') {
      throw new Error('explanation 字段缺失或非字符串');
    }
    if (!Array.isArray(parsed.faqs) || parsed.faqs.length < 2) {
      throw new Error('faqs 字段缺失或少于 2 条');
    }

    const card = {
      kp_id: kp.id,
      explanation: parsed.explanation,
      faqs: parsed.faqs,
      textbook_ref: undefined as string | undefined,
      meta: {
        generated_at: new Date().toISOString(),
        model: AI_MODEL,
        reviewed: false,
      },
    };

    cards.push(card);
    fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2), 'utf-8');
    console.log(`  已生成并写入\n`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const msg = `[${kp.id}] ${kp.name}: ${errorMessage}`;
    console.error(`  失败：${msg}\n`);
    fs.appendFileSync(ERROR_LOG, `${new Date().toISOString()} ${msg}\n`);
  }
}

if (!dryRun) {
  console.log(`\n完成！共生成 ${cards.length - existingCards.length} 张知识卡。`);
  if (fs.existsSync(ERROR_LOG)) {
    console.log(`失败记录见：${ERROR_LOG}`);
  }
}
