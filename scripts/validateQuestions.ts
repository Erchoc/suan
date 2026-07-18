/**
 * 题目校验脚本
 * 用法：pnpm run validate:questions [--force] [--concurrency N]
 *
 * 功能：
 *  1. 基础字段校验（必填、枚举、____数量匹配等）
 *  2. 自动订正 blank_types：对所有缺少 blank_types 的题目，
 *     根据答案内容推断类型（number / choice / text）并写回文件
 *  3. 自动清理未知字段（保留规范字段，删除多余字段）
 *  4. 对 1-3 年级出现 text 类型填空的题目发出重点警告
 *
 * 参数：
 *  --force         同时处理已标记为 enable=false 的题目（默认跳过）
 *  --concurrency   保留兼容性，validate 是纯内存操作，实际单线程即可
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_PATH = path.join(ROOT, 'public/questions.json');
const GRAPH_PATH = path.join(ROOT, 'src/data/knowledge-graph.json');

const FORCE = process.argv.includes('--force');

type JsonObject = Record<string, unknown>;

interface KPRaw {
  id: string;
}

interface UnitRaw {
  kps: KPRaw[];
}

interface DomainRaw {
  units: UnitRaw[];
}

interface GradeRaw {
  domains: DomainRaw[];
}

interface GraphData {
  grades: GradeRaw[];
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKPRaw(value: unknown): value is KPRaw {
  return isJsonObject(value) && typeof value.id === 'string';
}

function isUnitRaw(value: unknown): value is UnitRaw {
  return isJsonObject(value) && Array.isArray(value.kps) && value.kps.every(isKPRaw);
}

function isDomainRaw(value: unknown): value is DomainRaw {
  return isJsonObject(value) && Array.isArray(value.units) && value.units.every(isUnitRaw);
}

function isGradeRaw(value: unknown): value is GradeRaw {
  return isJsonObject(value) && Array.isArray(value.domains) && value.domains.every(isDomainRaw);
}

function isGraphData(value: unknown): value is GraphData {
  return isJsonObject(value) && Array.isArray(value.grades) && value.grades.every(isGradeRaw);
}

function parseJsonObjectArray(source: string): JsonObject[] {
  const parsed: unknown = JSON.parse(source);
  if (!Array.isArray(parsed)) throw new Error('题目数据必须是 JSON 数组');

  const items: unknown[] = parsed;
  if (!items.every(isJsonObject)) throw new Error('题目数组元素必须是对象');
  return items;
}

const allQuestions = parseJsonObjectArray(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));
const skippedDisabled = !FORCE ? allQuestions.filter(q => q.enable === false) : [];
// 实际处理的题目集合
const questions = FORCE
  ? allQuestions
  : allQuestions.filter(q => q.enable !== false);

if (!FORCE && skippedDisabled.length > 0) {
  console.log(`⏭️  跳过 ${skippedDisabled.length} 道已禁用题目（enable=false），加 --force 可强制校验`);
}
const graphValue: unknown = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
if (!isGraphData(graphValue)) throw new Error('知识图谱数据格式无效');
const graphData = graphValue;

// 构建有效的 kp_id 集合
const validKPIds = new Set<string>();
graphData.grades.forEach(grade => {
  grade.domains.forEach(domain => {
    domain.units.forEach(unit => {
      unit.kps.forEach(kp => validKPIds.add(kp.id));
    });
  });
});

// ─── 规范字段定义（用于清理未知字段）────────────────────────────────────────
const KNOWN_FIELDS = new Set([
  'id', 'kp_id', 'kp_name', 'grade', 'semester',
  'difficulty', 'type', 'question', 'blanks', 'blank_types',
  'choices', 'correctChoice', 'solution', 'common_mistake', 'hint',
  'enable', 'checkMessage',
]);

// ─── blank_types 分类 ──────────────────────────────────────────────────────
type BlankInputType = 'number' | 'choice' | 'text';

function classifyBlankType(answer: string): BlankInputType {
  const s = answer.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'number';
  if (/^-?\d+\/\d+$/.test(s)) return 'number';
  if (/^\(-?\d+\)$/.test(s)) return 'number';
  if (/^\d+(\.\d+)?%$/.test(s)) return 'number';
  if (/^[A-D]$/.test(s)) return 'choice';
  return 'text';
}

function gradeFromKpId(kpId: string): number {
  return parseInt(kpId?.split('-')[0]) || 0;
}

// ─── 校验阶段 ──────────────────────────────────────────────────────────────

let errors = 0;
let warnings = 0;
const idSet = new Set<string>();

questions.forEach((q, index) => {
  const prefix = `[${index + 1}] ${q.id ?? '?'}`;
  const issueMessages: string[] = [];

  const required = ['id', 'kp_id', 'difficulty', 'question', 'blanks', 'solution'];
  required.forEach(field => {
    if (q[field] === undefined || q[field] === null || q[field] === '') {
      const msg = `缺少必填字段: ${field}`;
      console.error(`${prefix} ❌ ${msg}`);
      issueMessages.push(msg);
      errors++;
    }
  });

  const difficulty = q.difficulty;
  if (difficulty && (typeof difficulty !== 'string' || !['easy', 'medium', 'hard'].includes(difficulty))) {
    const msg = `difficulty 无效值: ${difficulty}`;
    console.error(`${prefix} ❌ ${msg}`);
    issueMessages.push(msg);
    errors++;
  }

  if (q.blanks && !Array.isArray(q.blanks)) {
    const msg = 'blanks 必须是数组';
    console.error(`${prefix} ❌ ${msg}`);
    issueMessages.push(msg);
    errors++;
  }

  if (typeof q.question === 'string' && Array.isArray(q.blanks)) {
    const blankCount = (q.question.match(/____/g) ?? []).length;
    if (blankCount !== q.blanks.length) {
      const msg = `题目中有 ${blankCount} 个填空位（____），但 blanks 数组只有 ${q.blanks.length} 个答案，数据不一致`;
      console.warn(`${prefix} ⚠️  ____ 数量 (${blankCount}) 与 blanks 长度 (${q.blanks.length}) 不匹配 → 已自动标记 enable=false`);
      warnings++;
      issueMessages.push(msg);
    } else if (FORCE && q.enable === false && typeof q.checkMessage === 'string' && q.checkMessage.includes('填空位')) {
      // 格式问题已被手动修复，且是 validate 脚本标记的（不是 AI check），恢复 enable
      delete q.enable;
      delete q.checkMessage;
      console.log(`${prefix} ✅ 填空位格式已修复，已恢复启用`);
    }
  }

  // 将所有格式错误写入 enable/checkMessage
  if (issueMessages.length > 0) {
    q.enable = false;
    q.checkMessage = issueMessages.join('；');
  }

  if (typeof q.kp_id === 'string' && q.kp_id && !validKPIds.has(q.kp_id)) {
    console.warn(`${prefix} ⚠️  kp_id ${q.kp_id} 在知识图谱中不存在`);
    warnings++;
  }

  if (typeof q.id === 'string' && q.id) {
    if (idSet.has(q.id)) {
      console.warn(`${prefix} ⚠️  重复的题目 id: ${q.id}`);
      warnings++;
    }
    idSet.add(q.id);
  }
});

const disabledCount = allQuestions.filter(q => q.enable === false).length;
console.log(`\n📊 校验完成：共 ${questions.length} 道题（跳过 ${skippedDisabled.length} 道已禁用），${errors} 个错误，${warnings} 个警告${disabledCount > 0 ? `，累计 ${disabledCount} 道已禁用` : ''}`);

// ─── 未知字段清理 ──────────────────────────────────────────────────────────

let cleanedCount = 0;
let totalRemovedFields = 0;

questions.forEach(q => {
  const unknownKeys = Object.keys(q).filter(k => !KNOWN_FIELDS.has(k));
  if (unknownKeys.length > 0) {
    unknownKeys.forEach(k => delete q[k]);
    cleanedCount++;
    totalRemovedFields += unknownKeys.length;
  }
});

if (cleanedCount > 0) {
  console.log(`\n🧹 清理未知字段：${cleanedCount} 道题，共删除 ${totalRemovedFields} 个字段`);
} else {
  console.log(`\n✅ 无多余字段，数据干净`);
}

// ─── blank_types 自动订正 ──────────────────────────────────────────────────

let fixedCount = 0;
let textBlankCount = 0;
const textWarnings: string[] = [];

questions.forEach((q, index) => {
  const blankValues: unknown[] = Array.isArray(q.blanks) ? q.blanks : [];
  const blanks = blankValues.filter((blank): blank is string => typeof blank === 'string');
  if (blanks.length === 0) return;

  if (Array.isArray(q.blank_types) && q.blank_types.length === blanks.length) return;

  const types: BlankInputType[] = blanks.map(classifyBlankType);
  q.blank_types = types;
  fixedCount++;

  const hasText = types.some(t => t === 'text');
  if (hasText) {
    textBlankCount++;
    const grade = gradeFromKpId(typeof q.kp_id === 'string' ? q.kp_id : '');
    const gradeLabel = grade > 0 ? `${grade}年级` : '未知年级';
    const textAnswers = blanks
      .map((b, i) => (types[i] === 'text' ? `"${b}"` : null))
      .filter(Boolean)
      .join(', ');
    const prefix = `[${index + 1}] ${q.id ?? '?'} (${gradeLabel})`;
    if (grade <= 3) {
      textWarnings.push(`${prefix} 🚨 低年级含中文填空（将被过滤）：${textAnswers}`);
    } else {
      textWarnings.push(`${prefix} ⚠️  含非数字填空：${textAnswers}`);
    }
  }
});

const needsWrite = fixedCount > 0 || cleanedCount > 0;

if (needsWrite) {
  // questions 中的对象是 allQuestions 的引用，修改已自动同步，直接写全量
  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(allQuestions, null, 2), 'utf-8');
  if (fixedCount > 0) {
    console.log(`✅ 已自动订正 blank_types：${fixedCount} 道题`);
  }
} else {
  console.log(`✅ blank_types 已全部就绪，无需订正`);
}

if (textWarnings.length > 0) {
  console.log(`\n📋 含非数字填空的题目（共 ${textBlankCount} 道，低年级开启过滤后将跳过）：`);
  textWarnings.forEach(w => console.log(`  ${w}`));
} else {
  console.log(`\n🎉 所有填空答案均为数字类型，低年级兼容性良好`);
}

// ─── 知识点覆盖统计 ────────────────────────────────────────────────────────

const kpCount = new Map<string, number>();
allQuestions.forEach(q => {
  if (typeof q.kp_id === 'string' && q.kp_id) {
    kpCount.set(q.kp_id, (kpCount.get(q.kp_id) ?? 0) + 1);
  }
});
console.log(`\n📚 覆盖知识点: ${kpCount.size} / ${validKPIds.size}`);
const missing = [...validKPIds].filter(id => !kpCount.has(id));
if (missing.length > 0) {
  console.log(`❓ 缺少题目的知识点 (${missing.length}): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
}

process.exit(errors > 0 ? 1 : 0);
