export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'fill_blank' | 'choice' | 'mixed';
export type BlankInputType = 'number' | 'choice' | 'text';

export interface QuestionChoice {
  label: string;
  content: string;
}

export interface QuestionRecord {
  id: string;
  kp_id: string;
  kp_name: string;
  grade: string;
  semester: string;
  difficulty: QuestionDifficulty;
  type: QuestionType;
  question: string;
  blanks: string[];
  blank_types?: BlankInputType[];
  choices?: QuestionChoice[];
  correctChoice?: string;
  solution: string;
  common_mistake: string;
  hint: string;
  enable: boolean;
  checkMessage?: string;
}

export interface QuestionPatch {
  kp_id?: string;
  kp_name?: string;
  grade?: string;
  semester?: string;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
  question?: string;
  blanks?: string[];
  blank_types?: BlankInputType[] | null;
  choices?: QuestionChoice[] | null;
  correctChoice?: string | null;
  solution?: string;
  common_mistake?: string;
  hint?: string;
  enable?: boolean;
  checkMessage?: string | null;
}

export interface QuestionBankMeta {
  draftRevision: number;
  publishedRevision: number;
  sourceSha256: string | null;
  importedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminQuestionFilters {
  page: number;
  pageSize: number;
  query?: string;
  grade?: string;
  semester?: string;
  difficulty?: QuestionDifficulty;
  type?: QuestionType;
  status?: 'enabled' | 'disabled';
  attention?: 'reported';
}

export interface QuestionReportSummary {
  openCount: number;
  latestReason: string;
  latestAt: string;
}

export interface AdminQuestionRecord extends QuestionRecord {
  reportSummary?: QuestionReportSummary;
}

export interface QuestionReportInput {
  questionId: string;
  publishedRevision: number;
  reason: string;
  source: 'exam' | 'review';
  sessionId: string;
}

export interface QuestionReportRecord {
  id: string;
  questionId: string;
  publishedRevision: number;
  questionSnapshot: QuestionRecord;
  reason: string;
  source: 'exam' | 'review';
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
}

export interface QuestionAuditEntry {
  id: number;
  revision: number;
  questionId: string | null;
  action: string;
  before: unknown;
  after: unknown;
  actor: string;
  createdAt: string;
}

type QuestionBankErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'NOT_READY';

export class QuestionBankError extends Error {
  constructor(
    readonly code: QuestionBankErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'QuestionBankError';
  }
}

interface QuestionRow {
  id: string;
  kp_id: string;
  kp_name: string;
  grade: string;
  semester: string;
  difficulty: QuestionDifficulty;
  type: QuestionType;
  question: string;
  blanks_json: string;
  blank_types_json: string | null;
  choices_json: string | null;
  correct_choice: string | null;
  solution: string;
  common_mistake: string;
  hint: string;
  enable: number;
  check_message: string | null;
}

interface MetaRow {
  draft_revision: number;
  published_revision: number;
  source_sha256: string | null;
  imported_at: string | null;
  published_at: string | null;
  updated_at: string;
}

interface CountRow {
  count: number;
}

interface StatsRow {
  total: number;
  enabled: number;
  disabled: number;
  reported: number;
}

interface AdminQuestionRow extends QuestionRow {
  open_report_count: number;
  latest_report_reason: string | null;
  latest_report_at: string | null;
}

interface QuestionReportRow {
  id: string;
  question_id: string;
  published_revision: number;
  question_snapshot_json: string;
  reason: string;
  source: 'exam' | 'review';
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at: string | null;
}

interface AuditRow {
  id: number;
  revision: number;
  question_id: string | null;
  action: string;
  before_json: string | null;
  after_json: string | null;
  actor: string;
  created_at: string;
}

const QUESTION_COLUMNS = `id, kp_id, kp_name, grade, semester, difficulty, type, question,
  blanks_json, blank_types_json, choices_json, correct_choice, solution, common_mistake,
  hint, enable, check_message`;
const ADMIN_QUESTION_COLUMNS = QUESTION_COLUMNS.split(',')
  .map(column => `q.${column.trim()}`)
  .join(', ');

const DIFFICULTIES = new Set<QuestionDifficulty>(['easy', 'medium', 'hard']);
const QUESTION_TYPES = new Set<QuestionType>(['fill_blank', 'choice', 'mixed']);
const BLANK_TYPES = new Set<BlankInputType>(['number', 'choice', 'text']);
const PATCH_KEYS = new Set<keyof QuestionPatch>([
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new QuestionBankError('NOT_READY', '题库数据格式损坏');
  }
}

function rowToQuestion(row: QuestionRow): QuestionRecord {
  const blankTypes = parseJson<BlankInputType[] | undefined>(row.blank_types_json, undefined);
  const choices = parseJson<QuestionChoice[] | undefined>(row.choices_json, undefined);
  return {
    id: row.id,
    kp_id: row.kp_id,
    kp_name: row.kp_name,
    grade: row.grade,
    semester: row.semester,
    difficulty: row.difficulty,
    type: row.type,
    question: row.question,
    blanks: parseJson<string[]>(row.blanks_json, []),
    ...(blankTypes ? { blank_types: blankTypes } : {}),
    ...(choices ? { choices } : {}),
    ...(row.correct_choice ? { correctChoice: row.correct_choice } : {}),
    solution: row.solution,
    common_mistake: row.common_mistake,
    hint: row.hint,
    enable: row.enable === 1,
    ...(row.check_message ? { checkMessage: row.check_message } : {}),
  };
}

function rowToMeta(row: MetaRow): QuestionBankMeta {
  return {
    draftRevision: row.draft_revision,
    publishedRevision: row.published_revision,
    sourceSha256: row.source_sha256,
    importedAt: row.imported_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function rowToAdminQuestion(row: AdminQuestionRow): AdminQuestionRecord {
  const question = rowToQuestion(row);
  if (!row.open_report_count || !row.latest_report_reason || !row.latest_report_at) {
    return question;
  }
  return {
    ...question,
    reportSummary: {
      openCount: row.open_report_count,
      latestReason: row.latest_report_reason,
      latestAt: row.latest_report_at,
    },
  };
}

function rowToQuestionReport(row: QuestionReportRow): QuestionReportRecord {
  return {
    id: row.id,
    questionId: row.question_id,
    publishedRevision: row.published_revision,
    questionSnapshot: parseJson<QuestionRecord>(row.question_snapshot_json, {} as QuestionRecord),
    reason: row.reason,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function readString(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new QuestionBankError('VALIDATION', `${key} 必须是字符串`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new QuestionBankError('VALIDATION', `${key} 长度不合法`);
  }
  return normalized;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | null {
  if (record[key] === null || record[key] === '') return null;
  return readString(record, key, maxLength);
}

function readStringArray(value: unknown, key: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new QuestionBankError('VALIDATION', `${key} 格式不合法`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 500) {
      throw new QuestionBankError('VALIDATION', `${key}[${index}] 格式不合法`);
    }
    return item.trim();
  });
}

function readChoices(value: unknown): QuestionChoice[] {
  if (!Array.isArray(value) || value.length > 10) {
    throw new QuestionBankError('VALIDATION', 'choices 格式不合法');
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new QuestionBankError('VALIDATION', `choices[${index}] 格式不合法`);
    }
    return {
      label: readString(item, 'label', 8),
      content: readString(item, 'content', 500),
    };
  });
}

export function parseQuestionPatch(value: unknown): QuestionPatch {
  if (!isRecord(value)) throw new QuestionBankError('VALIDATION', '请求体必须是对象');
  const unknownKey = Object.keys(value).find(key => !PATCH_KEYS.has(key as keyof QuestionPatch));
  if (unknownKey) throw new QuestionBankError('VALIDATION', `不支持字段 ${unknownKey}`);
  if (Object.keys(value).length === 0) throw new QuestionBankError('VALIDATION', '没有可更新字段');

  const patch: QuestionPatch = {};
  if ('kp_id' in value) patch.kp_id = readString(value, 'kp_id', 40);
  if ('kp_name' in value) patch.kp_name = readString(value, 'kp_name', 120);
  if ('grade' in value) patch.grade = readString(value, 'grade', 20);
  if ('semester' in value) patch.semester = readString(value, 'semester', 20);
  if ('difficulty' in value) {
    if (!DIFFICULTIES.has(value.difficulty as QuestionDifficulty)) {
      throw new QuestionBankError('VALIDATION', 'difficulty 不合法');
    }
    patch.difficulty = value.difficulty as QuestionDifficulty;
  }
  if ('type' in value) {
    if (!QUESTION_TYPES.has(value.type as QuestionType)) {
      throw new QuestionBankError('VALIDATION', 'type 不合法');
    }
    patch.type = value.type as QuestionType;
  }
  if ('question' in value) patch.question = readString(value, 'question', 2_000);
  if ('blanks' in value) patch.blanks = readStringArray(value.blanks, 'blanks', 20);
  if ('blank_types' in value) {
    if (value.blank_types === null) patch.blank_types = null;
    else {
      const blankTypes = readStringArray(value.blank_types, 'blank_types', 20);
      if (!blankTypes.every(blankType => BLANK_TYPES.has(blankType as BlankInputType))) {
        throw new QuestionBankError('VALIDATION', 'blank_types 包含不支持的类型');
      }
      patch.blank_types = blankTypes as BlankInputType[];
    }
  }
  if ('choices' in value)
    patch.choices = value.choices === null ? null : readChoices(value.choices);
  if ('correctChoice' in value) {
    patch.correctChoice = readNullableString(value, 'correctChoice', 8);
  }
  if ('solution' in value) patch.solution = readString(value, 'solution', 4_000);
  if ('common_mistake' in value) {
    patch.common_mistake = readString(value, 'common_mistake', 4_000);
  }
  if ('hint' in value) patch.hint = readString(value, 'hint', 2_000);
  if ('enable' in value) {
    if (typeof value.enable !== 'boolean') {
      throw new QuestionBankError('VALIDATION', 'enable 必须是布尔值');
    }
    patch.enable = value.enable;
  }
  if ('checkMessage' in value) {
    patch.checkMessage = readNullableString(value, 'checkMessage', 1_000);
  }
  return patch;
}

function validateQuestion(question: QuestionRecord): void {
  if (question.blank_types && question.blank_types.length !== question.blanks.length) {
    throw new QuestionBankError('VALIDATION', 'blank_types 必须与 blanks 一一对应');
  }
  if (question.type === 'fill_blank' && question.blanks.length === 0) {
    throw new QuestionBankError('VALIDATION', '填空题至少需要一个答案');
  }
  if (question.type === 'choice' || question.type === 'mixed') {
    if (!question.choices?.length || !question.correctChoice) {
      throw new QuestionBankError('VALIDATION', '选择题需要选项和正确选项');
    }
    if (!question.choices.some(choice => choice.label === question.correctChoice)) {
      throw new QuestionBankError('VALIDATION', '正确选项必须存在于 choices 中');
    }
  }
  if (question.type === 'mixed' && question.blanks.length === 0) {
    throw new QuestionBankError('VALIDATION', '综合题至少需要一个填空答案');
  }
  if (!question.enable && !question.checkMessage) {
    throw new QuestionBankError('VALIDATION', '禁用题目时必须填写质量原因');
  }
}

function mergeQuestion(question: QuestionRecord, patch: QuestionPatch): QuestionRecord {
  const merged: QuestionRecord = {
    ...question,
    ...patch,
    blank_types:
      patch.blank_types === null ? undefined : (patch.blank_types ?? question.blank_types),
    choices: patch.choices === null ? undefined : (patch.choices ?? question.choices),
    correctChoice:
      patch.correctChoice === null ? undefined : (patch.correctChoice ?? question.correctChoice),
    checkMessage:
      patch.checkMessage === null ? undefined : (patch.checkMessage ?? question.checkMessage),
  };
  if (patch.enable === true && !('checkMessage' in patch)) merged.checkMessage = undefined;
  validateQuestion(merged);
  return merged;
}

function databaseValues(question: QuestionRecord, now: string): unknown[] {
  return [
    question.kp_id,
    question.kp_name,
    question.grade,
    question.semester,
    question.difficulty,
    question.type,
    question.question,
    JSON.stringify(question.blanks),
    question.blank_types ? JSON.stringify(question.blank_types) : null,
    question.choices ? JSON.stringify(question.choices) : null,
    question.correctChoice ?? null,
    question.solution,
    question.common_mistake,
    question.hint,
    question.enable ? 1 : 0,
    question.checkMessage ?? null,
    now,
    question.id,
  ];
}

export async function getQuestionBankMeta(db: D1Database): Promise<QuestionBankMeta> {
  const row = await db
    .prepare(`SELECT draft_revision, published_revision, source_sha256, imported_at,
      published_at, updated_at FROM question_bank_meta WHERE singleton_id = 1`)
    .first<MetaRow>();
  if (!row) throw new QuestionBankError('NOT_READY', '题库数据库尚未初始化');
  return rowToMeta(row);
}

export async function listPublishedQuestions(
  db: D1Database,
): Promise<{ questions: QuestionRecord[]; meta: QuestionBankMeta }> {
  const meta = await getQuestionBankMeta(db);
  if (meta.publishedRevision === 0) {
    throw new QuestionBankError('NOT_READY', '题库尚未发布');
  }
  const result = await db
    .prepare(`SELECT ${QUESTION_COLUMNS} FROM published_questions WHERE enable = 1 ORDER BY id`)
    .all<QuestionRow>();
  return { questions: result.results.map(rowToQuestion), meta };
}

export async function getPublishedQuestion(
  db: D1Database,
  questionId: string,
): Promise<{ question: QuestionRecord; meta: QuestionBankMeta }> {
  const meta = await getQuestionBankMeta(db);
  if (meta.publishedRevision === 0) {
    throw new QuestionBankError('NOT_READY', '题库尚未发布');
  }
  const row = await db
    .prepare(`SELECT ${QUESTION_COLUMNS} FROM published_questions WHERE id = ? AND enable = 1`)
    .bind(questionId)
    .first<QuestionRow>();
  if (!row) throw new QuestionBankError('NOT_FOUND', '题目不存在');
  return { question: rowToQuestion(row), meta };
}

export async function submitQuestionReport(
  db: D1Database,
  input: QuestionReportInput,
  reportId: string,
  now: string,
): Promise<{ id: string; status: 'open' }> {
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) {
    throw new QuestionBankError('VALIDATION', '反馈原因长度不合法');
  }
  if (!input.sessionId || input.sessionId.length > 80) {
    throw new QuestionBankError('VALIDATION', '会话 ID 不合法');
  }
  if (!Number.isInteger(input.publishedRevision) || input.publishedRevision <= 0) {
    throw new QuestionBankError('VALIDATION', '题库版本不合法');
  }

  const meta = await getQuestionBankMeta(db);
  if (input.publishedRevision > meta.publishedRevision) {
    throw new QuestionBankError('VALIDATION', '题库版本不合法');
  }

  let snapshotRow = await db
    .prepare(
      `SELECT ${QUESTION_COLUMNS} FROM published_question_versions
       WHERE revision = ? AND id = ? AND enable = 1`,
    )
    .bind(input.publishedRevision, input.questionId)
    .first<QuestionRow>();
  if (!snapshotRow && input.publishedRevision === meta.publishedRevision) {
    snapshotRow = await db
      .prepare(`SELECT ${QUESTION_COLUMNS} FROM published_questions WHERE id = ? AND enable = 1`)
      .bind(input.questionId)
      .first<QuestionRow>();
  }
  if (!snapshotRow) {
    throw new QuestionBankError('NOT_FOUND', '题目版本不存在');
  }

  const dedupeKey = `${input.source}:${input.sessionId}:${input.questionId}:${input.publishedRevision}`;
  await db
    .prepare(
      `INSERT INTO question_reports
        (id, dedupe_key, question_id, published_revision, question_snapshot_json,
         reason, source, session_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         question_snapshot_json = excluded.question_snapshot_json,
         reason = excluded.reason,
         status = 'open',
         resolution_note = NULL,
         created_at = excluded.created_at,
         resolved_at = NULL`,
    )
    .bind(
      reportId,
      dedupeKey,
      input.questionId,
      input.publishedRevision,
      JSON.stringify(rowToQuestion(snapshotRow)),
      reason,
      input.source,
      input.sessionId,
      now,
    )
    .run();
  const stored = await db
    .prepare(`SELECT id FROM question_reports WHERE dedupe_key = ?`)
    .bind(dedupeKey)
    .first<{ id: string }>();
  if (!stored) throw new QuestionBankError('NOT_READY', '反馈保存失败');
  return { id: stored.id, status: 'open' };
}

export async function listOpenQuestionReports(
  db: D1Database,
  questionId: string,
  limit: number,
): Promise<QuestionReportRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, question_id, published_revision, question_snapshot_json, reason, source,
        status, created_at, resolved_at FROM question_reports
       WHERE question_id = ? AND status = 'open'
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(questionId, limit)
    .all<QuestionReportRow>();
  return result.results.map(rowToQuestionReport);
}

export async function dismissOpenQuestionReports(
  db: D1Database,
  questionId: string,
  note: string,
  now: string,
): Promise<number> {
  const normalizedNote = note.trim();
  if (!normalizedNote || normalizedNote.length > 500) {
    throw new QuestionBankError('VALIDATION', '处理说明长度不合法');
  }
  const result = await db
    .prepare(
      `UPDATE question_reports SET status = 'dismissed', resolution_note = ?, resolved_at = ?
       WHERE question_id = ? AND status = 'open'`,
    )
    .bind(normalizedNote, now, questionId)
    .run();
  if (result.meta.changes > 0) {
    await db
      .prepare(
        `INSERT INTO question_audit_logs
          (revision, question_id, action, before_json, after_json, actor, created_at)
         SELECT draft_revision, ?, 'dismiss_reports', NULL, ?, 'admin', ?
         FROM question_bank_meta WHERE singleton_id = 1`,
      )
      .bind(questionId, JSON.stringify({ count: result.meta.changes, note: normalizedNote }), now)
      .run();
  }
  return result.meta.changes;
}

function buildAdminWhere(filters: AdminQuestionFilters): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.query) {
    clauses.push('(q.id LIKE ? OR q.kp_id LIKE ? OR q.kp_name LIKE ? OR q.question LIKE ?)');
    const query = `%${filters.query}%`;
    values.push(query, query, query, query);
  }
  for (const [column, value] of [
    ['grade', filters.grade],
    ['semester', filters.semester],
    ['difficulty', filters.difficulty],
    ['type', filters.type],
  ] as const) {
    if (!value) continue;
    clauses.push(`q.${column} = ?`);
    values.push(value);
  }
  if (filters.status) {
    clauses.push('q.enable = ?');
    values.push(filters.status === 'enabled' ? 1 : 0);
  }
  if (filters.attention === 'reported') {
    clauses.push(
      `EXISTS (SELECT 1 FROM question_reports report
        WHERE report.question_id = q.id AND report.status = 'open')`,
    );
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', values };
}

export async function listAdminQuestions(db: D1Database, filters: AdminQuestionFilters) {
  const where = buildAdminWhere(filters);
  const offset = (filters.page - 1) * filters.pageSize;
  const [questionsResult, filteredCount, stats, meta] = await Promise.all([
    db
      .prepare(
        `SELECT ${ADMIN_QUESTION_COLUMNS},
          (SELECT COUNT(*) FROM question_reports report
            WHERE report.question_id = q.id AND report.status = 'open') AS open_report_count,
          (SELECT report.reason FROM question_reports report
            WHERE report.question_id = q.id AND report.status = 'open'
            ORDER BY report.created_at DESC, report.id DESC LIMIT 1) AS latest_report_reason,
          (SELECT report.created_at FROM question_reports report
            WHERE report.question_id = q.id AND report.status = 'open'
            ORDER BY report.created_at DESC, report.id DESC LIMIT 1) AS latest_report_at
         FROM questions q${where.sql}
         ORDER BY q.updated_at DESC, q.id ASC LIMIT ? OFFSET ?`,
      )
      .bind(...where.values, filters.pageSize, offset)
      .all<AdminQuestionRow>(),
    db
      .prepare(`SELECT COUNT(*) AS count FROM questions q${where.sql}`)
      .bind(...where.values)
      .first<CountRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(enable), 0) AS enabled,
        COUNT(*) - COALESCE(SUM(enable), 0) AS disabled,
        (SELECT COUNT(DISTINCT question_id) FROM question_reports WHERE status = 'open') AS reported
        FROM questions`)
      .first<StatsRow>(),
    getQuestionBankMeta(db),
  ]);
  return {
    data: questionsResult.results.map(rowToAdminQuestion),
    page: filters.page,
    pageSize: filters.pageSize,
    total: filteredCount?.count ?? 0,
    stats: stats ?? { total: 0, enabled: 0, disabled: 0, reported: 0 },
    meta,
  };
}

export async function updateQuestion(
  db: D1Database,
  questionId: string,
  patch: QuestionPatch,
  now: string,
): Promise<{ question: QuestionRecord; meta: QuestionBankMeta }> {
  const row = await db
    .prepare(`SELECT ${QUESTION_COLUMNS} FROM questions WHERE id = ?`)
    .bind(questionId)
    .first<QuestionRow>();
  if (!row) throw new QuestionBankError('NOT_FOUND', '题目不存在');
  const before = rowToQuestion(row);
  const after = mergeQuestion(before, patch);
  await db.batch([
    db
      .prepare(
        `UPDATE questions SET kp_id = ?, kp_name = ?, grade = ?, semester = ?, difficulty = ?,
          type = ?, question = ?, blanks_json = ?, blank_types_json = ?, choices_json = ?,
          correct_choice = ?, solution = ?, common_mistake = ?, hint = ?, enable = ?,
          check_message = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(...databaseValues(after, now)),
    db
      .prepare(
        `UPDATE question_bank_meta SET draft_revision = draft_revision + 1,
         updated_at = ? WHERE singleton_id = 1`,
      )
      .bind(now),
    db
      .prepare(
        `INSERT INTO question_audit_logs
          (revision, question_id, action, before_json, after_json, actor, created_at)
         SELECT draft_revision, ?, 'update', ?, ?, 'admin', ?
         FROM question_bank_meta WHERE singleton_id = 1`,
      )
      .bind(questionId, JSON.stringify(before), JSON.stringify(after), now),
  ]);
  return { question: after, meta: await getQuestionBankMeta(db) };
}

export async function batchSetQuestionStatus(
  db: D1Database,
  ids: string[],
  enable: boolean,
  reason: string | undefined,
  now: string,
): Promise<QuestionBankMeta> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0 || uniqueIds.length > 100) {
    throw new QuestionBankError('VALIDATION', 'ids 必须包含 1 到 100 道题');
  }
  const normalizedReason = reason?.trim();
  if (!enable && (!normalizedReason || normalizedReason.length > 1_000)) {
    throw new QuestionBankError('VALIDATION', '批量禁用时必须填写质量原因');
  }
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(`SELECT ${QUESTION_COLUMNS} FROM questions WHERE id IN (${placeholders})`)
    .bind(...uniqueIds)
    .all<QuestionRow>();
  if (rows.results.length !== uniqueIds.length) {
    throw new QuestionBankError('NOT_FOUND', '部分题目不存在');
  }
  const before = rows.results.map(rowToQuestion);
  const after = before.map(question => ({
    ...question,
    enable,
    checkMessage: enable ? undefined : normalizedReason,
  }));
  const statements = [
    db
      .prepare(
        `UPDATE questions SET enable = ?, check_message = ?, updated_at = ?
         WHERE id IN (${placeholders})`,
      )
      .bind(enable ? 1 : 0, enable ? null : normalizedReason, now, ...uniqueIds),
    db
      .prepare(
        `UPDATE question_bank_meta SET draft_revision = draft_revision + 1,
         updated_at = ? WHERE singleton_id = 1`,
      )
      .bind(now),
    ...before.map((question, index) =>
      db
        .prepare(
          `INSERT INTO question_audit_logs
            (revision, question_id, action, before_json, after_json, actor, created_at)
           SELECT draft_revision, ?, ?, ?, ?, 'admin', ?
           FROM question_bank_meta WHERE singleton_id = 1`,
        )
        .bind(
          question.id,
          enable ? 'batch_enable' : 'batch_disable',
          JSON.stringify(question),
          JSON.stringify(after[index]),
          now,
        ),
    ),
  ];
  await db.batch(statements);
  return getQuestionBankMeta(db);
}

export async function publishQuestionBank(
  db: D1Database,
  expectedDraftRevision: number,
  now: string,
) {
  const [meta, stats] = await Promise.all([
    getQuestionBankMeta(db),
    db
      .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(enable), 0) AS enabled,
        COUNT(*) - COALESCE(SUM(enable), 0) AS disabled, 0 AS reported FROM questions`)
      .first<StatsRow>(),
  ]);
  if (meta.draftRevision !== expectedDraftRevision) {
    throw new QuestionBankError('CONFLICT', '题库草稿已更新，请刷新后重试');
  }
  if (meta.draftRevision === meta.publishedRevision) {
    throw new QuestionBankError('CONFLICT', '当前没有待发布变更');
  }
  if (!stats?.total) throw new QuestionBankError('NOT_READY', '题库尚未导入');

  await db.batch([
    db
      .prepare(
        `INSERT OR REPLACE INTO published_question_versions
          (revision, ${QUESTION_COLUMNS}, published_at)
         SELECT ?, ${QUESTION_COLUMNS}, ? FROM questions
         WHERE (SELECT draft_revision = ? AND draft_revision != published_revision
                FROM question_bank_meta WHERE singleton_id = 1)`,
      )
      .bind(meta.draftRevision, now, expectedDraftRevision),
    db
      .prepare(
        `DELETE FROM published_questions
         WHERE (SELECT draft_revision = ? AND draft_revision != published_revision
                FROM question_bank_meta WHERE singleton_id = 1)`,
      )
      .bind(expectedDraftRevision),
    db
      .prepare(
        `INSERT INTO published_questions (${QUESTION_COLUMNS}, published_revision, published_at)
         SELECT ${QUESTION_COLUMNS}, ?, ? FROM questions
         WHERE (SELECT draft_revision = ? AND draft_revision != published_revision
                FROM question_bank_meta WHERE singleton_id = 1)`,
      )
      .bind(meta.draftRevision, now, expectedDraftRevision),
    db
      .prepare(
        `INSERT OR REPLACE INTO question_bank_releases
          (revision, question_count, enabled_count, source_sha256, published_at)
         SELECT ?, ?, ?, source_sha256, ? FROM question_bank_meta
         WHERE singleton_id = 1 AND draft_revision = ?
           AND draft_revision != published_revision`,
      )
      .bind(meta.draftRevision, stats.total, stats.enabled, now, expectedDraftRevision),
    db
      .prepare(
        `INSERT INTO question_audit_logs
          (revision, question_id, action, before_json, after_json, actor, created_at)
         SELECT ?, NULL, 'publish', ?, ?, 'admin', ? FROM question_bank_meta
         WHERE singleton_id = 1 AND draft_revision = ?
           AND draft_revision != published_revision`,
      )
      .bind(
        meta.draftRevision,
        JSON.stringify(meta),
        JSON.stringify({ revision: meta.draftRevision, ...stats }),
        now,
        expectedDraftRevision,
      ),
    db
      .prepare(
        `UPDATE question_reports SET status = 'resolved',
          resolution_note = '题目修改已发布', resolved_at = ?
         WHERE status = 'open'
           AND (SELECT draft_revision = ? AND draft_revision != published_revision
                FROM question_bank_meta WHERE singleton_id = 1)
           AND EXISTS (
             SELECT 1 FROM question_audit_logs audit
             WHERE audit.question_id = question_reports.question_id
               AND audit.revision > question_reports.published_revision
               AND audit.revision <= ?
               AND audit.action IN ('update', 'batch_enable', 'batch_disable')
           )`,
      )
      .bind(now, expectedDraftRevision, expectedDraftRevision),
    db
      .prepare(
        `UPDATE question_bank_meta SET published_revision = draft_revision,
          published_at = ?, updated_at = ? WHERE singleton_id = 1
          AND draft_revision = ? AND draft_revision != published_revision`,
      )
      .bind(now, now, expectedDraftRevision),
  ]);
  const publishedMeta = await getQuestionBankMeta(db);
  if (publishedMeta.publishedRevision !== expectedDraftRevision) {
    throw new QuestionBankError('CONFLICT', '题库草稿已更新，请刷新后重试');
  }
  return { meta: publishedMeta, stats };
}

export async function listQuestionAudit(db: D1Database, limit: number) {
  const result = await db
    .prepare(
      `SELECT id, revision, question_id, action, before_json, after_json, actor, created_at
       FROM question_audit_logs ORDER BY id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<AuditRow>();
  return result.results.map(
    (row): QuestionAuditEntry => ({
      id: row.id,
      revision: row.revision,
      questionId: row.question_id,
      action: row.action,
      before: parseJson(row.before_json, null),
      after: parseJson(row.after_json, null),
      actor: row.actor,
      createdAt: row.created_at,
    }),
  );
}

export async function exportDraftQuestions(db: D1Database) {
  const [result, meta] = await Promise.all([
    db.prepare(`SELECT ${QUESTION_COLUMNS} FROM questions ORDER BY id`).all<QuestionRow>(),
    getQuestionBankMeta(db),
  ]);
  return { data: result.results.map(rowToQuestion), meta };
}

export function isMissingQuestionBankSchema(error: unknown): boolean {
  return error instanceof Error && /no such table|D1_ERROR.*table/iu.test(error.message);
}
