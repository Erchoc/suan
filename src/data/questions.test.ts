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
      jsonResponse([enabledQuestion, disabledQuestion, invalidQuestion, null, 'invalid-question']),
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
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse([question]));
    vi.stubGlobal('fetch', fetchMock);
    const { loadQuestions } = await import('./questions');

    await expect(loadQuestions()).rejects.toThrow('题库加载失败：503');
    await expect(loadQuestions()).resolves.toEqual([question]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a response whose top-level value is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ questions: [] })));
    const { loadQuestions } = await import('./questions');

    await expect(loadQuestions()).rejects.toThrow('题库格式错误');
  });
});
