import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionReportApiError, submitQuestionReport } from './questionReports';

const request = {
  questionId: 'question/1',
  publishedRevision: 3,
  reason: 'The answer is incorrect.',
  source: 'exam' as const,
  sessionId: '00000000-0000-4000-8000-000000000001',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('question report client', () => {
  it('submits the versioned question and session context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitQuestionReport(request)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/questions/question%2F1/report', {
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
  });

  it('surfaces structured and fallback API errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Too many reports' } }), { status: 429 }),
      )
      .mockResolvedValueOnce(new Response('not json', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitQuestionReport(request)).rejects.toEqual(
      new QuestionReportApiError(429, 'Too many reports'),
    );
    await expect(submitQuestionReport(request)).rejects.toEqual(
      new QuestionReportApiError(500, '反馈提交失败，请稍后重试'),
    );
  });
});
