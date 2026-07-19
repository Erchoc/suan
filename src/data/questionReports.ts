export interface QuestionReportRequest {
  questionId: string;
  publishedRevision: number;
  reason: string;
  source: 'exam' | 'review';
  sessionId: string;
}

export class QuestionReportApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'QuestionReportApiError';
  }
}

export async function submitQuestionReport(request: QuestionReportRequest): Promise<void> {
  const response = await fetch(`/api/questions/${encodeURIComponent(request.questionId)}/report`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-suan-client-id': request.sessionId,
    },
    body: JSON.stringify({
      reason: request.reason,
      source: request.source,
      sessionId: request.sessionId,
      publishedRevision: request.publishedRevision,
    }),
  });
  if (response.ok) return;

  const payload: unknown = await response.json().catch(() => null);
  const message =
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
      ? payload.error.message
      : '反馈提交失败，请稍后重试';
  throw new QuestionReportApiError(response.status, message);
}
