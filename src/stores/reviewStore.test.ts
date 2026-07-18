import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../types';
import { useReviewStore } from './reviewStore';

const memoryStorage = vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });
  return storage;
});

function createQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'review-question',
    kp_id: 'kp-1',
    kp_name: 'Addition',
    grade: 'Grade 1',
    semester: 'First semester',
    difficulty: 'easy',
    type: 'mixed',
    question: 'Choose the equation and enter its result: ____',
    blanks: ['2'],
    correctChoice: 'A',
    solution: 'Choose 1 + 1 and add it.',
    common_mistake: 'Choosing subtraction.',
    hint: 'Look for two equal addends.',
    ...overrides,
  };
}

describe('reviewStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useReviewStore.setState({ sessions: {} });
    memoryStorage.clear();
  });

  it('moves a review session through answering, feedback, and completion', () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const question = createQuestion();
    const sessionId = useReviewStore
      .getState()
      .createSession([{ type: 'kps', kpIds: ['kp-1'] }], [question]);

    useReviewStore.getState().setAnswer(sessionId, question.id, [' 2 ']);
    useReviewStore.getState().setChoiceAnswer(sessionId, question.id, 'A');
    expect(useReviewStore.getState().submitAnswer(sessionId, question.id)).toBe('correct');

    useReviewStore.getState().toggleBookmark(sessionId, question.id);
    useReviewStore.getState().setIssueReport(sessionId, question.id, 'Ambiguous wording');
    now = 5_000;
    useReviewStore.getState().completeSession(sessionId);

    expect(useReviewStore.getState().getSession(sessionId)).toMatchObject({
      sessionId,
      answers: { [question.id]: [' 2 '] },
      choiceAnswers: { [question.id]: 'A' },
      results: { [question.id]: 'correct' },
      bookmarks: [question.id],
      issueReports: { [question.id]: 'Ambiguous wording' },
      startedAt: 1_000,
      completedAt: 5_000,
    });

    useReviewStore.getState().toggleBookmark(sessionId, question.id);
    useReviewStore.getState().setIssueReport(sessionId, question.id, '  ');
    expect(useReviewStore.getState().getSession(sessionId)).toMatchObject({
      bookmarks: [],
      issueReports: {},
    });

    const persisted = JSON.parse(memoryStorage.getItem('suandao-review') ?? '{}');
    expect(persisted.state.sessions[sessionId].results[question.id]).toBe('correct');
  });

  it('ignores missing sessions and questions without creating state', () => {
    const sessionId = useReviewStore.getState().createSession([], [createQuestion()]);

    useReviewStore.getState().setAnswer('missing-session', 'question', ['1']);
    useReviewStore.getState().setChoiceAnswer('missing-session', 'question', 'A');
    useReviewStore.getState().toggleBookmark('missing-session', 'question');
    useReviewStore.getState().setIssueReport('missing-session', 'question', 'reason');
    useReviewStore.getState().completeSession('missing-session');

    expect(useReviewStore.getState().submitAnswer('missing-session', 'question')).toBe('wrong');
    expect(useReviewStore.getState().submitAnswer(sessionId, 'missing-question')).toBe('wrong');
    expect(useReviewStore.getState().getSession('missing-session')).toBeNull();
    expect(Object.keys(useReviewStore.getState().sessions)).toEqual([sessionId]);
  });

  it('records a wrong result for an existing question', () => {
    const question = createQuestion();
    const sessionId = useReviewStore.getState().createSession([], [question]);

    useReviewStore.getState().setAnswer(sessionId, question.id, ['3']);
    useReviewStore.getState().setChoiceAnswer(sessionId, question.id, 'A');

    expect(useReviewStore.getState().submitAnswer(sessionId, question.id)).toBe('wrong');
    expect(useReviewStore.getState().getSession(sessionId)?.results).toEqual({
      [question.id]: 'wrong',
    });
  });

  it('keeps only the ten newest review sessions', () => {
    let timestamp = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => timestamp++);
    const firstSessionId = useReviewStore.getState().createSession([], []);

    for (let index = 0; index < 10; index += 1) {
      useReviewStore.getState().createSession([], []);
    }

    expect(Object.keys(useReviewStore.getState().sessions)).toHaveLength(10);
    expect(useReviewStore.getState().getSession(firstSessionId)).toBeNull();
  });
});
