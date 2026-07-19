import { readAIConfig, requestAIText } from '../scripts/aiText.ts';
import graphData from '../src/data/knowledge-graph.json';
import {
  applyQualityQuestionBatch,
  getQualityQuestionBatch,
  insertGeneratedQuestionBatch,
  listQuestionIdsForQuality,
  type QualityCheckDecision,
  QuestionBankError,
  type QuestionDifficulty,
  type QuestionRecord,
  type QuestionType,
} from './questionBank';

export type QuestionTaskType = 'generate' | 'quality';
export type QuestionTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type QuestionTaskEventLevel = 'info' | 'success' | 'warning' | 'error';
export type GenerationTypeMode = 'auto' | QuestionType;
export type QualityScope = 'all' | 'enabled' | 'disabled' | 'reported';

export interface GenerateQuestionTaskParams {
  grade: number;
  semester?: '上' | '下';
  kpId?: string;
  typeMode: GenerationTypeMode;
  countPerKnowledgePoint: 3 | 5;
}

export interface QualityQuestionTaskParams {
  scope: QualityScope;
  grade?: number;
  semester?: '上' | '下';
  type?: QuestionType;
  limit: 20 | 50 | 100 | 200 | 'all';
}

export type QuestionTaskParams = GenerateQuestionTaskParams | QualityQuestionTaskParams;

export interface QuestionTaskRequest {
  type: QuestionTaskType;
  params: QuestionTaskParams;
}

export interface QuestionTaskPayload extends QuestionTaskRequest {
  taskId: string;
}

export interface QuestionTaskStats {
  [key: string]: number;
}

export interface QuestionTaskEventRecord {
  id: number;
  level: QuestionTaskEventLevel;
  message: string;
  progressCurrent: number | null;
  progressTotal: number | null;
  createdAt: string;
}

export interface QuestionTaskRecord {
  id: string;
  workflowInstanceId: string;
  type: QuestionTaskType;
  status: QuestionTaskStatus;
  params: QuestionTaskParams;
  stage: string;
  progressCurrent: number;
  progressTotal: number;
  stats: QuestionTaskStats;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  events?: QuestionTaskEventRecord[];
}

export interface KnowledgePointTarget {
  id: string;
  name: string;
  deps: string[];
  gradeName: string;
  gradeNum: number;
  semester: '上' | '下';
  unitName: string;
  domainName: string;
  isBridge: boolean;
}

interface QuestionTaskRow {
  id: string;
  workflow_instance_id: string;
  type: QuestionTaskType;
  status: QuestionTaskStatus;
  params_json: string;
  stage: string;
  progress_current: number;
  progress_total: number;
  stats_json: string;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface QuestionTaskEventRow {
  id: number;
  level: QuestionTaskEventLevel;
  message: string;
  progress_current: number | null;
  progress_total: number | null;
  created_at: string;
}

type JsonRecord = Record<string, unknown>;

const QUESTION_TYPES = new Set<QuestionType>(['fill_blank', 'choice', 'mixed']);
const GENERATION_MODES = new Set<GenerationTypeMode>(['auto', 'fill_blank', 'choice', 'mixed']);
const QUALITY_SCOPES = new Set<QualityScope>(['all', 'enabled', 'disabled', 'reported']);
const GENERATION_COUNTS = new Set([3, 5]);
const QUALITY_LIMITS = new Set([20, 50, 100, 200]);
const BRIDGE_IDS = new Set(graphData.meta.bridgePoints.groups.flatMap(group => group.kpIds));

export const KNOWLEDGE_POINT_TARGETS: KnowledgePointTarget[] = graphData.grades.flatMap(
  (grade, gradeIndex) =>
    grade.domains.flatMap(domain =>
      domain.units.flatMap(unit =>
        unit.kps.map(kp => ({
          id: kp.id,
          name: kp.name,
          deps: kp.deps,
          gradeName: grade.name,
          gradeNum: gradeIndex + 1,
          semester: unit.semester as '上' | '下',
          unitName: unit.name,
          domainName: domain.name,
          isBridge: BRIDGE_IDS.has(kp.id),
        })),
      ),
    ),
);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new QuestionBankError('NOT_READY', '题库任务数据格式损坏');
  }
}

function readOptionalSemester(value: unknown): '上' | '下' | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === '上' || value === '下') return value;
  throw new QuestionBankError('VALIDATION', 'semester 不合法');
}

function readOptionalGrade(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6) {
    return Number(value);
  }
  throw new QuestionBankError('VALIDATION', 'grade 不合法');
}

function readGenerateParams(value: unknown): GenerateQuestionTaskParams {
  if (!isRecord(value)) throw new QuestionBankError('VALIDATION', 'params 必须是对象');
  const grade = readOptionalGrade(value.grade);
  if (!grade) throw new QuestionBankError('VALIDATION', '生成题库必须选择年级');
  const semester = readOptionalSemester(value.semester);
  const typeMode = value.typeMode;
  if (typeof typeMode !== 'string' || !GENERATION_MODES.has(typeMode as GenerationTypeMode)) {
    throw new QuestionBankError('VALIDATION', 'typeMode 不合法');
  }
  const countPerKnowledgePoint = Number(value.countPerKnowledgePoint);
  if (!GENERATION_COUNTS.has(countPerKnowledgePoint)) {
    throw new QuestionBankError('VALIDATION', 'countPerKnowledgePoint 不合法');
  }
  const kpId = value.kpId;
  if (kpId !== undefined && (typeof kpId !== 'string' || !kpId.trim() || kpId.length > 40)) {
    throw new QuestionBankError('VALIDATION', 'kpId 不合法');
  }
  const normalizedKpId = typeof kpId === 'string' ? kpId.trim() : undefined;
  if (normalizedKpId) {
    const target = KNOWLEDGE_POINT_TARGETS.find(kp => kp.id === normalizedKpId);
    if (!target || target.gradeNum !== grade || (semester && target.semester !== semester)) {
      throw new QuestionBankError('VALIDATION', '知识点不属于当前年级学期');
    }
  }
  return {
    grade,
    ...(semester ? { semester } : {}),
    ...(normalizedKpId ? { kpId: normalizedKpId } : {}),
    typeMode: typeMode as GenerationTypeMode,
    countPerKnowledgePoint: countPerKnowledgePoint as 3 | 5,
  };
}

function readQualityParams(value: unknown): QualityQuestionTaskParams {
  if (!isRecord(value)) throw new QuestionBankError('VALIDATION', 'params 必须是对象');
  if (typeof value.scope !== 'string' || !QUALITY_SCOPES.has(value.scope as QualityScope)) {
    throw new QuestionBankError('VALIDATION', 'scope 不合法');
  }
  const grade = readOptionalGrade(value.grade);
  const semester = readOptionalSemester(value.semester);
  const type = value.type;
  if (
    type !== undefined &&
    (typeof type !== 'string' || !QUESTION_TYPES.has(type as QuestionType))
  ) {
    throw new QuestionBankError('VALIDATION', 'type 不合法');
  }
  const limit = value.limit === 'all' ? 'all' : Number(value.limit);
  if (limit !== 'all' && !QUALITY_LIMITS.has(limit)) {
    throw new QuestionBankError('VALIDATION', 'limit 不合法');
  }
  return {
    scope: value.scope as QualityScope,
    ...(grade ? { grade } : {}),
    ...(semester ? { semester } : {}),
    ...(type ? { type: type as QuestionType } : {}),
    limit: limit as QualityQuestionTaskParams['limit'],
  };
}

export function parseQuestionTaskRequest(value: unknown): QuestionTaskRequest {
  if (!isRecord(value) || (value.type !== 'generate' && value.type !== 'quality')) {
    throw new QuestionBankError('VALIDATION', '任务类型不合法');
  }
  return {
    type: value.type,
    params:
      value.type === 'generate'
        ? readGenerateParams(value.params)
        : readQualityParams(value.params),
  };
}

function rowToTask(row: QuestionTaskRow): QuestionTaskRecord {
  return {
    id: row.id,
    workflowInstanceId: row.workflow_instance_id,
    type: row.type,
    status: row.status,
    params: parseJson<QuestionTaskParams>(row.params_json),
    stage: row.stage,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    stats: parseJson<QuestionTaskStats>(row.stats_json),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function rowToTaskEvent(row: QuestionTaskEventRow): QuestionTaskEventRecord {
  return {
    id: row.id,
    level: row.level,
    message: row.message,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    createdAt: row.created_at,
  };
}

export async function createQuestionTask(
  db: D1Database,
  taskId: string,
  request: QuestionTaskRequest,
  now: string,
): Promise<QuestionTaskRecord> {
  const active = await db
    .prepare(`SELECT id FROM question_tasks WHERE status IN ('queued', 'running') LIMIT 1`)
    .first<{ id: string }>();
  if (active) {
    throw new QuestionBankError('CONFLICT', '已有题库任务正在运行，请等待完成后再开始新任务');
  }
  const stage = request.type === 'generate' ? '等待生成' : '等待质检';
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO question_tasks
            (id, workflow_instance_id, type, status, params_json, stage,
             progress_current, progress_total, stats_json, created_at, updated_at)
           VALUES (?, ?, ?, 'queued', ?, ?, 0, 0, '{}', ?, ?)`,
        )
        .bind(taskId, taskId, request.type, JSON.stringify(request.params), stage, now, now),
      db
        .prepare(
          `INSERT INTO question_task_events
            (task_id, event_key, level, message, progress_current, progress_total, created_at)
           VALUES (?, 'queued', 'info', ?, 0, 0, ?)`,
        )
        .bind(taskId, request.type === 'generate' ? '生成任务已排队' : '质检任务已排队', now),
    ]);
  } catch (error) {
    const conflicting = await db
      .prepare(`SELECT id FROM question_tasks WHERE status IN ('queued', 'running') LIMIT 1`)
      .first<{ id: string }>();
    if (conflicting) {
      throw new QuestionBankError('CONFLICT', '已有题库任务正在运行，请等待完成后再开始新任务');
    }
    throw error;
  }
  return getQuestionTask(db, taskId);
}

export async function listQuestionTasks(
  db: D1Database,
  limit: number,
): Promise<QuestionTaskRecord[]> {
  const result = await db
    .prepare(`SELECT * FROM question_tasks ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(limit)
    .all<QuestionTaskRow>();
  return result.results.map(rowToTask);
}

export async function getQuestionTask(db: D1Database, taskId: string): Promise<QuestionTaskRecord> {
  const [row, events] = await Promise.all([
    db.prepare(`SELECT * FROM question_tasks WHERE id = ?`).bind(taskId).first<QuestionTaskRow>(),
    db
      .prepare(
        `SELECT id, level, message, progress_current, progress_total, created_at
         FROM question_task_events WHERE task_id = ? ORDER BY id DESC LIMIT 40`,
      )
      .bind(taskId)
      .all<QuestionTaskEventRow>(),
  ]);
  if (!row) throw new QuestionBankError('NOT_FOUND', '题库任务不存在');
  return { ...rowToTask(row), events: events.results.map(rowToTaskEvent) };
}

export async function markQuestionTaskRunning(
  db: D1Database,
  taskId: string,
  stage: string,
  total: number,
  now: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE question_tasks SET status = 'running', stage = ?, progress_total = ?,
          started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`,
      )
      .bind(stage, total, now, now, taskId),
    db
      .prepare(
        `INSERT OR IGNORE INTO question_task_events
          (task_id, event_key, level, message, progress_current, progress_total, created_at)
         VALUES (?, 'started', 'info', ?, 0, ?, ?)`,
      )
      .bind(taskId, stage, total, now),
  ]);
}

export async function updateQuestionTaskProgress(
  db: D1Database,
  input: {
    taskId: string;
    eventKey: string;
    stage: string;
    current: number;
    total: number;
    stats: QuestionTaskStats;
    level?: QuestionTaskEventLevel;
    message: string;
    now: string;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE question_tasks SET status = 'running', stage = ?, progress_current = ?,
          progress_total = ?, stats_json = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        input.stage,
        input.current,
        input.total,
        JSON.stringify(input.stats),
        input.now,
        input.taskId,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO question_task_events
          (task_id, event_key, level, message, progress_current, progress_total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.taskId,
        input.eventKey,
        input.level ?? 'info',
        input.message,
        input.current,
        input.total,
        input.now,
      ),
  ]);
}

export async function completeQuestionTask(
  db: D1Database,
  taskId: string,
  stage: string,
  stats: QuestionTaskStats,
  now: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE question_tasks SET status = 'completed', stage = ?,
          progress_current = progress_total, stats_json = ?, error_message = NULL,
          completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(stage, JSON.stringify(stats), now, now, taskId),
    db
      .prepare(
        `INSERT OR IGNORE INTO question_task_events
          (task_id, event_key, level, message, progress_current, progress_total, created_at)
         SELECT id, 'completed', 'success', ?, progress_total, progress_total, ?
         FROM question_tasks WHERE id = ?`,
      )
      .bind(stage, now, taskId),
  ]);
}

export async function failQuestionTask(
  db: D1Database,
  taskId: string,
  message: string,
  now: string,
): Promise<void> {
  const boundedMessage = message.replace(/\s+/g, ' ').trim().slice(0, 500) || '任务执行失败';
  await db.batch([
    db
      .prepare(
        `UPDATE question_tasks SET status = 'failed', stage = '执行失败', error_message = ?,
          completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(boundedMessage, now, now, taskId),
    db
      .prepare(
        `INSERT OR IGNORE INTO question_task_events
          (task_id, event_key, level, message, progress_current, progress_total, created_at)
         SELECT id, 'failed', 'error', ?, progress_current, progress_total, ?
         FROM question_tasks WHERE id = ?`,
      )
      .bind(boundedMessage, now, taskId),
  ]);
}

export async function cancelQuestionTask(
  db: D1Database,
  taskId: string,
  now: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE question_tasks SET status = 'cancelled', stage = '管理员已停止',
          error_message = NULL, completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, taskId),
    db
      .prepare(
        `INSERT OR IGNORE INTO question_task_events
          (task_id, event_key, level, message, progress_current, progress_total, created_at)
         SELECT id, 'cancelled', 'warning', '管理员已停止任务', progress_current,
          progress_total, ? FROM question_tasks WHERE id = ?`,
      )
      .bind(now, taskId),
  ]);
}

export function selectGenerationTargets(
  params: GenerateQuestionTaskParams,
): KnowledgePointTarget[] {
  return KNOWLEDGE_POINT_TARGETS.filter(
    target =>
      target.gradeNum === params.grade &&
      (!params.semester || target.semester === params.semester) &&
      (!params.kpId || target.id === params.kpId),
  );
}

interface SequenceState {
  fill_blank: number;
  choice: number;
  mixed: number;
}

async function getNextSequences(db: D1Database, kpId: string): Promise<SequenceState> {
  const rows = await db
    .prepare(`SELECT id FROM questions WHERE kp_id = ?`)
    .bind(kpId)
    .all<{ id: string }>();
  const state: SequenceState = { fill_blank: 1, choice: 1, mixed: 1 };
  const patterns: Record<QuestionType, RegExp> = {
    fill_blank: new RegExp(`^${kpId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`),
    choice: new RegExp(`^${kpId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-c(\\d+)$`),
    mixed: new RegExp(`^${kpId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-m(\\d+)$`),
  };
  for (const row of rows.results) {
    for (const type of QUESTION_TYPES) {
      const match = row.id.match(patterns[type]);
      if (match) state[type] = Math.max(state[type], Number(match[1]) + 1);
    }
  }
  return state;
}

function requestedTypeDescription(mode: GenerationTypeMode): string {
  if (mode === 'fill_blank') return '全部为填空题';
  if (mode === 'choice') return '全部为四选一选择题';
  if (mode === 'mixed') return '全部为先选择再填空的综合题';
  return '均衡包含填空题、四选一选择题和综合题';
}

export function buildGenerationPrompt(
  target: KnowledgePointTarget,
  typeMode: GenerationTypeMode,
  count: number,
): string {
  const deps = target.deps.length ? target.deps.join('、') : '无';
  return `你是一位严谨的小学数学命题老师，请为指定知识点生成 ${count} 道全新的题目。

知识点：${target.id} ${target.name}
年级学期：${target.gradeName}${target.semester}学期
所属单元：${target.domainName} / ${target.unitName}
前置知识点：${deps}
题型要求：${requestedTypeDescription(typeMode)}
${target.isBridge ? '该知识点属于衔接重点，但仍不得超出当前小学年级范围。' : ''}

质量要求：
1. 每题只考察当前知识点，题意清楚、答案唯一、计算正确，不依赖缺失图片。
2. 难度在 easy、medium、hard 中合理分布。
3. 填空题使用 ____ 标识空位，blanks 与空位一一对应，答案使用普通键盘可输入文本。
4. 选择题必须提供 A/B/C/D 四个选项和唯一 correctChoice。
5. 综合题同时包含选择项和至少一个填空。
6. 不使用 LaTeX，不输出重复题目，不抄写示例。
7. 只输出 JSON 数组，不要解释、markdown 或代码块。

字段格式：
[
  {
    "type": "fill_blank | choice | mixed",
    "difficulty": "easy | medium | hard",
    "question": "题干",
    "blanks": ["答案"],
    "choices": [{ "label": "A", "content": "选项" }],
    "correctChoice": "A",
    "solution": "完整解题过程",
    "common_mistake": "常见错误",
    "hint": "提示"
  }
]`;
}

function extractJsonArray(raw: string): unknown[] {
  const normalized = raw.trim();
  try {
    const parsed: unknown = JSON.parse(normalized);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Some models wrap JSON with reasoning or Markdown; scan for a valid array below.
  }
  const starts = [...normalized.matchAll(/\[/g)].map(match => match.index);
  const ends = [...normalized.matchAll(/\]/g)].map(match => match.index).reverse();
  for (const start of starts) {
    for (const end of ends) {
      if (start === undefined || end === undefined || end <= start) continue;
      try {
        const parsed: unknown = JSON.parse(normalized.slice(start, end + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Continue until a complete JSON array is found.
      }
    }
  }
  throw new Error('AI response does not contain a valid JSON array');
}

function readGeneratedString(record: JsonRecord, key: string, maximum: number): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new Error(`Generated ${key} is invalid`);
  }
  return value.trim();
}

function readGeneratedChoices(value: unknown): { label: string; content: string }[] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error('Generated choices are invalid');
  return value.map(item => {
    if (!isRecord(item)) throw new Error('Generated choice is invalid');
    return {
      label: readGeneratedString(item, 'label', 8),
      content: readGeneratedString(item, 'content', 500),
    };
  });
}

function generatedQuestionId(targetId: string, type: QuestionType, sequence: number): string {
  const suffix = String(sequence).padStart(2, '0');
  if (type === 'choice') return `${targetId}-c${suffix}`;
  if (type === 'mixed') return `${targetId}-m${suffix}`;
  return `${targetId}-${suffix}`;
}

export function parseGeneratedQuestions(
  raw: string,
  target: KnowledgePointTarget,
  typeMode: GenerationTypeMode,
  count: number,
  sequences: SequenceState,
): QuestionRecord[] {
  const candidates = extractJsonArray(raw).slice(0, count);
  const next = { ...sequences };
  const questions: QuestionRecord[] = [];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    try {
      const candidateType = candidate.type;
      const type =
        typeMode === 'auto'
          ? QUESTION_TYPES.has(candidateType as QuestionType)
            ? (candidateType as QuestionType)
            : (['fill_blank', 'choice', 'mixed'][questions.length % 3] as QuestionType)
          : typeMode;
      const difficulty = QUESTION_TYPES.has(type)
        ? ['easy', 'medium', 'hard'].includes(String(candidate.difficulty))
          ? candidate.difficulty
          : 'medium'
        : 'medium';
      const blanks = Array.isArray(candidate.blanks)
        ? candidate.blanks
            .filter(value => typeof value === 'string' && value.trim())
            .slice(0, 10)
            .map(value => String(value).trim())
        : [];
      const questionText = readGeneratedString(candidate, 'question', 2_000);
      const choices =
        type === 'choice' || type === 'mixed' ? readGeneratedChoices(candidate.choices) : undefined;
      const correctChoice =
        type === 'choice' || type === 'mixed'
          ? readGeneratedString(candidate, 'correctChoice', 8)
          : undefined;
      if (
        (type === 'fill_blank' || type === 'mixed') &&
        (!questionText.includes('____') || !blanks.length)
      ) {
        throw new Error('Generated blanks do not match the question');
      }
      if (choices && !choices.some(choice => choice.label === correctChoice)) {
        throw new Error('Generated correct choice does not exist');
      }
      const question: QuestionRecord = {
        id: generatedQuestionId(target.id, type, next[type]++),
        kp_id: target.id,
        kp_name: target.name,
        grade: target.gradeName,
        semester: `${target.semester}学期`,
        difficulty: difficulty as QuestionDifficulty,
        type,
        question: questionText,
        blanks,
        ...(choices ? { choices } : {}),
        ...(correctChoice ? { correctChoice } : {}),
        solution: readGeneratedString(candidate, 'solution', 4_000),
        common_mistake: readGeneratedString(candidate, 'common_mistake', 4_000),
        hint: readGeneratedString(candidate, 'hint', 2_000),
        enable: false,
        checkMessage: 'AI 生成，等待质检',
      };
      questions.push(question);
    } catch {
      // A malformed item is skipped; the batch is retried when too few valid items remain.
    }
  }
  if (questions.length !== count) {
    throw new Error('AI did not return the requested number of valid questions');
  }
  return questions;
}

export async function generateQuestionsForTarget(
  env: CloudflareBindings,
  target: KnowledgePointTarget,
  params: GenerateQuestionTaskParams,
): Promise<QuestionRecord[]> {
  const sequences = await getNextSequences(env.CONTENT_DB, target.id);
  const raw = await requestAIText({
    config: readAIConfig(env),
    prompt: buildGenerationPrompt(target, params.typeMode, params.countPerKnowledgePoint),
    temperature: 0.7,
    maxTokens: 8_192,
  });
  return parseGeneratedQuestions(
    raw,
    target,
    params.typeMode,
    params.countPerKnowledgePoint,
    sequences,
  );
}

export function buildQualityPrompt(questions: QuestionRecord[]): string {
  const payload = questions.map(question => ({
    id: question.id,
    kp_name: question.kp_name,
    grade: question.grade,
    type: question.type,
    difficulty: question.difficulty,
    question: question.question,
    blanks: question.blanks,
    choices: question.choices,
    correctChoice: question.correctChoice,
    solution: question.solution,
  }));
  return `你是一位资深的小学数学教研员，请逐题质检以下 ${questions.length} 道题。

检查答案与解析是否正确、题意是否清晰且答案唯一、题型字段是否匹配、是否依赖缺失图片、难度和知识点是否适合标注年级。发现任一问题即判为 error。

输入：
${JSON.stringify(payload)}

只输出 JSON 数组，必须覆盖每个输入 ID，不要输出其他文字：
[
  { "id": "题目ID", "status": "ok" },
  { "id": "题目ID", "status": "error", "reason": "具体问题，一句话" }
]`;
}

export function parseQualityDecisions(raw: string, expectedIds: string[]): QualityCheckDecision[] {
  const expected = new Set(expectedIds);
  const decisions = extractJsonArray(raw)
    .filter(isRecord)
    .filter(item => typeof item.id === 'string' && expected.has(item.id))
    .map(item => {
      if (item.status !== 'ok' && item.status !== 'error') {
        throw new Error('AI returned an invalid quality status');
      }
      const reason = typeof item.reason === 'string' ? item.reason.trim().slice(0, 1_000) : '';
      if (item.status === 'error' && !reason) {
        throw new Error('AI quality error is missing a reason');
      }
      return {
        id: item.id as string,
        status: item.status,
        ...(reason ? { reason } : {}),
      } satisfies QualityCheckDecision;
    });
  const byId = new Map(decisions.map(decision => [decision.id, decision]));
  if (byId.size !== expectedIds.length) {
    throw new Error('AI quality response does not cover every question');
  }
  return expectedIds.map(id => byId.get(id)!);
}

export async function requestQualityDecisions(
  env: CloudflareBindings,
  questions: QuestionRecord[],
): Promise<QualityCheckDecision[]> {
  const raw = await requestAIText({
    config: readAIConfig(env),
    prompt: buildQualityPrompt(questions),
    temperature: 0.1,
    maxTokens: 4_096,
  });
  return parseQualityDecisions(
    raw,
    questions.map(question => question.id),
  );
}

export async function prepareQualityQuestionIds(
  db: D1Database,
  params: QualityQuestionTaskParams,
): Promise<string[]> {
  const gradeNames = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
  return listQuestionIdsForQuality(db, {
    scope: params.scope,
    ...(params.grade ? { grade: gradeNames[params.grade - 1] } : {}),
    ...(params.semester ? { semester: `${params.semester}学期` } : {}),
    ...(params.type ? { type: params.type } : {}),
    ...(params.limit === 'all' ? {} : { limit: params.limit }),
  });
}

export function loadQualityQuestionBatch(
  db: D1Database,
  questionIds: string[],
): Promise<QuestionRecord[]> {
  return getQualityQuestionBatch(db, questionIds);
}

export { applyQualityQuestionBatch, insertGeneratedQuestionBatch };
