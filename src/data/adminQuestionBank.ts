import type { BlankInputType, Choice, Question, QuestionType } from '../types';

export interface QuestionBankMeta {
  draftRevision: number;
  publishedRevision: number;
  sourceSha256: string | null;
  importedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminQuestionList {
  data: AdminQuestion[];
  page: number;
  pageSize: number;
  total: number;
  stats: { total: number; enabled: number; disabled: number; reported: number };
  meta: QuestionBankMeta;
}

export interface AdminQuestionFilters {
  page: number;
  pageSize: number;
  query?: string;
  grade?: string;
  semester?: string;
  difficulty?: Question['difficulty'];
  type?: QuestionType;
  status?: 'enabled' | 'disabled';
  attention?: 'reported';
}

export interface AdminQuestion extends Question {
  reportSummary?: {
    openCount: number;
    latestReason: string;
    latestAt: string;
  };
}

export interface QuestionReportEntry {
  id: string;
  questionId: string;
  publishedRevision: number;
  questionSnapshot: Question;
  reason: string;
  source: 'exam' | 'review';
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
}

export interface QuestionPatch {
  kp_id?: string;
  kp_name?: string;
  grade?: string;
  semester?: string;
  difficulty?: Question['difficulty'];
  type?: QuestionType;
  question?: string;
  blanks?: string[];
  blank_types?: BlankInputType[] | null;
  choices?: Choice[] | null;
  correctChoice?: string | null;
  solution?: string;
  common_mistake?: string;
  hint?: string;
  enable?: boolean;
  checkMessage?: string | null;
}

export type QuestionTaskType = 'generate' | 'quality';
export type QuestionTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerateQuestionTaskParams {
  grade: number;
  semester?: '上' | '下';
  kpId?: string;
  typeMode: 'auto' | QuestionType;
  countPerKnowledgePoint: 3 | 5;
}

export interface QualityQuestionTaskParams {
  scope: 'all' | 'enabled' | 'disabled' | 'reported';
  grade?: number;
  semester?: '上' | '下';
  type?: QuestionType;
  limit: 20 | 50 | 100 | 200;
}

export type QuestionTaskParams = GenerateQuestionTaskParams | QualityQuestionTaskParams;

export interface QuestionTaskEvent {
  id: number;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  progressCurrent: number | null;
  progressTotal: number | null;
  createdAt: string;
}

export interface QuestionTask {
  id: string;
  workflowInstanceId: string;
  type: QuestionTaskType;
  status: QuestionTaskStatus;
  params: QuestionTaskParams;
  stage: string;
  progressCurrent: number;
  progressTotal: number;
  stats: Record<string, number>;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  events?: QuestionTaskEvent[];
}

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'object' &&
      payload.error !== null &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
        ? payload.error.message
        : `请求失败：${response.status}`;
    throw new AdminApiError(response.status, message);
  }
  return payload as T;
}

function getAdminClientId(): string {
  const key = 'suan-admin-client-id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

async function adminFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  return readApiResponse<T>(response);
}

export function getAdminSession(): Promise<{ authenticated: boolean }> {
  return adminFetch('/api/admin/session');
}

export function loginAdmin(passcode: string): Promise<{ authenticated: true; expiresAt: number }> {
  return adminFetch('/api/admin/session', {
    method: 'POST',
    headers: { 'x-suan-client-id': getAdminClientId() },
    body: JSON.stringify({ pw: passcode }),
  });
}

export function listAdminQuestions(filters: AdminQuestionFilters): Promise<AdminQuestionList> {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'page' || key === 'pageSize' || !value) continue;
    params.set(key, String(value));
  }
  return adminFetch(`/api/admin/questions?${params.toString()}`);
}

export function updateAdminQuestion(
  questionId: string,
  patch: QuestionPatch,
): Promise<{ question: Question; meta: QuestionBankMeta }> {
  return adminFetch(`/api/admin/questions/${encodeURIComponent(questionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function batchSetAdminQuestionStatus(
  ids: string[],
  enable: boolean,
  reason?: string,
): Promise<{ ok: true; updated: number; meta: QuestionBankMeta }> {
  return adminFetch('/api/admin/questions/batch-status', {
    method: 'POST',
    body: JSON.stringify({ ids, enable, ...(reason ? { reason } : {}) }),
  });
}

export function listAdminQuestionReports(
  questionId: string,
): Promise<{ data: QuestionReportEntry[] }> {
  return adminFetch(
    `/api/admin/question-reports?questionId=${encodeURIComponent(questionId)}&limit=50`,
  );
}

export function dismissAdminQuestionReports(
  questionId: string,
  note: string,
): Promise<{ ok: true; dismissed: number }> {
  return adminFetch('/api/admin/question-reports/dismiss', {
    method: 'POST',
    body: JSON.stringify({ questionId, note }),
  });
}

export function startQuestionTask(
  type: 'generate',
  params: GenerateQuestionTaskParams,
): Promise<{ data: QuestionTask }>;
export function startQuestionTask(
  type: 'quality',
  params: QualityQuestionTaskParams,
): Promise<{ data: QuestionTask }>;
export function startQuestionTask(
  type: QuestionTaskType,
  params: QuestionTaskParams,
): Promise<{ data: QuestionTask }> {
  return adminFetch('/api/admin/question-tasks', {
    method: 'POST',
    headers: { 'x-suan-client-id': getAdminClientId() },
    body: JSON.stringify({ type, params }),
  });
}

export function listQuestionTasks(limit = 10): Promise<{ data: QuestionTask[] }> {
  return adminFetch(`/api/admin/question-tasks?limit=${limit}`);
}

export function getQuestionTask(
  taskId: string,
): Promise<{ data: QuestionTask; runtimeStatus: string | null }> {
  return adminFetch(`/api/admin/question-tasks/${encodeURIComponent(taskId)}`);
}

export function stopQuestionTask(taskId: string): Promise<{ ok: true }> {
  return adminFetch(`/api/admin/question-tasks/${encodeURIComponent(taskId)}/stop`, {
    method: 'POST',
  });
}
