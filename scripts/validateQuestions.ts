/**
 * Question validation script.
 * Usage: pnpm run validate:questions [--force] [--concurrency N]
 *
 * Features:
 *  1. Validate required fields, enums, and blank counts.
 *  2. Infer and persist missing blank_types values as number, choice, or text.
 *  3. Remove unknown fields while preserving the canonical schema.
 *  4. Highlight text-input blanks in grades 1-3.
 *
 * Options:
 *  --force         Also process questions marked enable=false.
 *  --concurrency   Retained for compatibility; validation runs in memory on one thread.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (!Array.isArray(parsed)) throw new Error('Question data must be a JSON array');

  const items: unknown[] = parsed;
  if (!items.every(isJsonObject)) throw new Error('Question array entries must be objects');
  return items;
}

const allQuestions = parseJsonObjectArray(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));
const skippedDisabled = !FORCE ? allQuestions.filter(q => q.enable === false) : [];
// Questions included in this validation run.
const questions = FORCE ? allQuestions : allQuestions.filter(q => q.enable !== false);

if (!FORCE && skippedDisabled.length > 0) {
  console.log(
    `⏭️  Skipped ${skippedDisabled.length} disabled questions; use --force to include them`,
  );
}
const graphValue: unknown = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
if (!isGraphData(graphValue)) throw new Error('Invalid knowledge graph data');
const graphData = graphValue;

// Build the set of valid knowledge point IDs.
const validKPIds = new Set<string>();
graphData.grades.forEach(grade => {
  grade.domains.forEach(domain => {
    domain.units.forEach(unit => {
      unit.kps.forEach(kp => validKPIds.add(kp.id));
    });
  });
});

// Canonical fields used to remove unknown data
const KNOWN_FIELDS = new Set([
  'id',
  'kp_id',
  'kp_name',
  'grade',
  'semester',
  'difficulty',
  'type',
  'question',
  'blanks',
  'blank_types',
  'choices',
  'correctChoice',
  'solution',
  'common_mistake',
  'hint',
  'enable',
  'checkMessage',
]);

// blank_types classification
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
  return parseInt(kpId?.split('-')[0], 10) || 0;
}

// Validation

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
  if (
    difficulty &&
    (typeof difficulty !== 'string' || !['easy', 'medium', 'hard'].includes(difficulty))
  ) {
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
      console.warn(
        `${prefix} ⚠️  ____ 数量 (${blankCount}) 与 blanks 长度 (${q.blanks.length}) 不匹配 → 已自动标记 enable=false`,
      );
      warnings++;
      issueMessages.push(msg);
    } else if (
      FORCE &&
      q.enable === false &&
      typeof q.checkMessage === 'string' &&
      q.checkMessage.includes('填空位')
    ) {
      // Re-enable a manually fixed formatting issue previously marked by this validator.
      delete q.enable;
      delete q.checkMessage;
      console.log(`${prefix} ✅ Blank formatting was fixed; question re-enabled`);
    }
  }

  // Persist every formatting error in enable and checkMessage.
  if (issueMessages.length > 0) {
    q.enable = false;
    q.checkMessage = issueMessages.join('；');
  }

  if (typeof q.kp_id === 'string' && q.kp_id && !validKPIds.has(q.kp_id)) {
    console.warn(`${prefix} ⚠️  kp_id ${q.kp_id} does not exist in the knowledge graph`);
    warnings++;
  }

  if (typeof q.id === 'string' && q.id) {
    if (idSet.has(q.id)) {
      console.warn(`${prefix} ⚠️  Duplicate question ID: ${q.id}`);
      warnings++;
    }
    idSet.add(q.id);
  }
});

const disabledCount = allQuestions.filter(q => q.enable === false).length;
console.log(
  `\n📊 Validation complete: ${questions.length} questions (${skippedDisabled.length} disabled skipped), ${errors} errors, ${warnings} warnings${disabledCount > 0 ? `, ${disabledCount} disabled total` : ''}`,
);

// Unknown-field cleanup

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
  console.log(`\n🧹 Cleaned ${totalRemovedFields} unknown fields from ${cleanedCount} questions`);
} else {
  console.log('\n✅ No unknown fields found');
}

// Automatic blank_types correction

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
    const gradeLabel = grade > 0 ? `Grade ${grade}` : 'Unknown grade';
    const textAnswers = blanks
      .map((b, i) => (types[i] === 'text' ? `"${b}"` : null))
      .filter(Boolean)
      .join(', ');
    const prefix = `[${index + 1}] ${q.id ?? '?'} (${gradeLabel})`;
    if (grade <= 3) {
      textWarnings.push(
        `${prefix} 🚨 Text-input blanks in a younger grade (filtered): ${textAnswers}`,
      );
    } else {
      textWarnings.push(`${prefix} ⚠️  Non-numeric blanks: ${textAnswers}`);
    }
  }
});

const needsWrite = fixedCount > 0 || cleanedCount > 0;

if (needsWrite) {
  // questions holds references from allQuestions, so write the full updated collection directly.
  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(allQuestions, null, 2), 'utf-8');
  if (fixedCount > 0) {
    console.log(`✅ Inferred blank_types for ${fixedCount} questions`);
  }
} else {
  console.log('✅ Every question already has blank_types');
}

if (textWarnings.length > 0) {
  console.log(
    `\n📋 Questions with non-numeric blanks: ${textBlankCount} (filtered for younger grades)`,
  );
  textWarnings.forEach(w => console.log(`  ${w}`));
} else {
  console.log('\n🎉 Every blank answer is numeric and compatible with younger grades');
}

// Knowledge point coverage

const kpCount = new Map<string, number>();
allQuestions.forEach(q => {
  if (typeof q.kp_id === 'string' && q.kp_id) {
    kpCount.set(q.kp_id, (kpCount.get(q.kp_id) ?? 0) + 1);
  }
});
console.log(`\n📚 Knowledge point coverage: ${kpCount.size} / ${validKPIds.size}`);
const missing = [...validKPIds].filter(id => !kpCount.has(id));
if (missing.length > 0) {
  console.log(
    `❓ Knowledge points without questions (${missing.length}): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`,
  );
}

process.exit(errors > 0 ? 1 : 0);
