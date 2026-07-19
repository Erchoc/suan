import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../types';

function createQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'question-1',
    kp_id: 'kp-1',
    kp_name: 'Addition',
    grade: 'Grade 1',
    semester: 'First semester',
    difficulty: 'easy',
    type: 'fill_blank',
    question: 'What is 1 + 1?',
    blanks: ['2'],
    solution: 'Add the two numbers.',
    common_mistake: 'Counting only one addend.',
    hint: 'Count one more after 1.',
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

describe('question data loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters invalid and disabled questions while sharing pending and cached loads', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const pendingResponse = new Promise<Response>(resolve => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pendingResponse);
    vi.stubGlobal('fetch', fetchMock);
    const { getCachedQuestionById, loadQuestions } = await import('./questions');
    const enabledQuestion = createQuestion();
    const disabledQuestion = createQuestion({ id: 'question-disabled', enable: false });
    const invalidQuestion = { id: 'question-invalid', question: 'Missing knowledge point ID' };

    const firstLoad = loadQuestions();
    const concurrentLoad = loadQuestions();

    expect(concurrentLoad).toBe(firstLoad);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch?.(
      jsonResponse({
        data: [enabledQuestion, disabledQuestion, invalidQuestion, null, 'invalid-question'],
      }),
    );

    const loaded = await firstLoad;
    expect(loaded).toEqual([enabledQuestion]);
    expect(getCachedQuestionById(enabledQuestion.id)).toEqual(enabledQuestion);
    expect(getCachedQuestionById(disabledQuestion.id)).toBeUndefined();
    expect(getCachedQuestionById('missing-question')).toBeUndefined();

    const cached = await loadQuestions();
    expect(cached).toBe(loaded);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports HTTP errors and retries after a failed load', async () => {
    const question = createQuestion();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'not initialized' }, 503))
      .mockResolvedValueOnce(jsonResponse({ data: [question] }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadQuestions } = await import('./questions');

    await expect(loadQuestions()).rejects.toThrow('D1 question bank unavailable: 503');
    await expect(loadQuestions()).resolves.toEqual([question]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/questions', '/api/questions']);
  });

  it('rejects a response whose top-level value is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: { questions: [] } })));
    const { loadQuestions } = await import('./questions');

    await expect(loadQuestions()).rejects.toThrow('题库格式错误');
  });

  it('rejects a malformed published question envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('invalid-envelope'));
    vi.stubGlobal('fetch', fetchMock);
    const { loadQuestions } = await import('./questions');

    await expect(loadQuestions()).rejects.toThrow('D1 question bank response is invalid');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('loads a single published question and preserves a D1 404', async () => {
    const question = createQuestion();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: question }))
      .mockResolvedValueOnce(jsonResponse({ error: 'missing' }, 404));
    vi.stubGlobal('fetch', fetchMock);
    const { loadQuestion } = await import('./questions');

    await expect(loadQuestion(question.id)).resolves.toEqual(question);
    await expect(loadQuestion('missing')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves single-question reads from the populated question cache', async () => {
    const question = createQuestion();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [question] }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadQuestion, loadQuestions } = await import('./questions');

    await loadQuestions();
    await expect(loadQuestion(question.id)).resolves.toEqual(question);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects a malformed single-question envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    const { loadQuestion } = await import('./questions');

    await expect(loadQuestion('question-1')).rejects.toThrow('D1 question response is invalid');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('ignores invalid and disabled single-question records', async () => {
    const disabled = createQuestion({ enable: false });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'missing-kp-id' } }))
      .mockResolvedValueOnce(jsonResponse({ data: disabled }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadQuestion } = await import('./questions');

    await expect(loadQuestion('invalid')).resolves.toBeUndefined();
    await expect(loadQuestion(disabled.id)).resolves.toBeUndefined();
  });
});
