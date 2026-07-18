import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadQuestions } from '../data/questions';
import type { Question } from '../types';
import { usePreviewStore } from './previewStore';

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

const cards = usePreviewStore.getState().cards;

function createCachedQuestion(): Question {
  return {
    id: 'cached-preview-question',
    kp_id: '1-1',
    kp_name: 'Counting',
    grade: 'Grade 1',
    semester: 'First semester',
    difficulty: 'easy',
    type: 'fill_blank',
    question: 'The number after 3 is ____.',
    blanks: ['4'],
    solution: 'Count one number after 3.',
    common_mistake: 'Counting backwards.',
    hint: 'Continue the counting sequence.',
  };
}

describe('previewStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    usePreviewStore.setState({ sessions: {}, cards });
    memoryStorage.clear();
  });

  it('creates sessions, persists only session state, and retains the ten newest sessions', () => {
    let timestamp = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => timestamp++);
    const firstSessionId = usePreviewStore.getState().createSession(['1-1']);

    expect(usePreviewStore.getState().getSession(firstSessionId)).toMatchObject({
      kpIds: ['1-1'],
      currentKpIndex: 0,
      phase: 'card',
      startedAt: 1_000,
    });

    for (let index = 0; index < 10; index += 1) {
      usePreviewStore.getState().createSession([`kp-${index}`]);
    }

    expect(Object.keys(usePreviewStore.getState().sessions)).toHaveLength(10);
    expect(usePreviewStore.getState().getSession(firstSessionId)).toBeNull();

    const persisted = JSON.parse(memoryStorage.getItem('suandao-preview') ?? '{}');
    expect(Object.keys(persisted.state.sessions)).toHaveLength(10);
    expect(persisted.state.cards).toBeUndefined();
  });

  it('updates the phase, answers, choices, skipped cards, and unique FAQ selections', () => {
    const sessionId = usePreviewStore.getState().createSession(['1-1', '1-2']);

    usePreviewStore.getState().setPhase(sessionId, 'faq');
    usePreviewStore.getState().setAnswer(sessionId, 'question-1', ['4']);
    usePreviewStore.getState().setChoiceAnswer(sessionId, 'question-1', 'B');
    usePreviewStore.getState().skipCard(sessionId);
    usePreviewStore.getState().skipCard(sessionId);
    usePreviewStore.getState().selectFAQ(sessionId, '1-1', 0);
    usePreviewStore.getState().selectFAQ(sessionId, '1-1', 0);
    usePreviewStore.getState().selectFAQ(sessionId, '1-1', 2);

    expect(usePreviewStore.getState().getSession(sessionId)).toMatchObject({
      phase: 'practice',
      answers: { 'question-1': ['4'] },
      choiceAnswers: { 'question-1': 'B' },
      cardSkippedKps: ['1-1'],
      faqSelectedIds: { '1-1': [0, 2] },
    });
  });

  it('advances between knowledge points and completes the final point', () => {
    let now = 2_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const sessionId = usePreviewStore.getState().createSession(['1-1', '1-2']);

    usePreviewStore.getState().setPhase(sessionId, 'practice');
    usePreviewStore.getState().completeKp(sessionId);
    expect(usePreviewStore.getState().getSession(sessionId)).toMatchObject({
      currentKpIndex: 1,
      phase: 'card',
    });

    now = 8_000;
    usePreviewStore.getState().completeKp(sessionId);
    expect(usePreviewStore.getState().getSession(sessionId)).toMatchObject({
      currentKpIndex: 1,
      phase: 'summary',
      completedAt: 8_000,
    });
  });

  it('judges answers through the production question cache', async () => {
    const question = createCachedQuestion();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([question]), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    await loadQuestions();
    const sessionId = usePreviewStore.getState().createSession([question.kp_id]);

    usePreviewStore.getState().setAnswer(sessionId, question.id, [' 4 ']);
    expect(usePreviewStore.getState().submitAnswer(sessionId, question.id)).toBe('correct');
    expect(usePreviewStore.getState().getSession(sessionId)?.results[question.id]).toBe('correct');

    usePreviewStore.getState().setAnswer(sessionId, question.id, ['5']);
    expect(usePreviewStore.getState().submitAnswer(sessionId, question.id)).toBe('wrong');
    expect(usePreviewStore.getState().getSession(sessionId)?.results[question.id]).toBe('wrong');
  });

  it('ignores missing sessions and reports missing cached questions as wrong', () => {
    const sessionId = usePreviewStore.getState().createSession(['1-1']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    usePreviewStore.getState().setPhase('missing-session', 'practice');
    usePreviewStore.getState().skipCard('missing-session');
    usePreviewStore.getState().setAnswer('missing-session', 'question', ['1']);
    usePreviewStore.getState().setChoiceAnswer('missing-session', 'question', 'A');
    usePreviewStore.getState().selectFAQ('missing-session', '1-1', 0);
    usePreviewStore.getState().completeKp('missing-session');

    expect(usePreviewStore.getState().submitAnswer('missing-session', 'question')).toBe('wrong');
    expect(usePreviewStore.getState().submitAnswer(sessionId, 'missing-question')).toBe('wrong');
    expect(warn).toHaveBeenCalledWith(
      '[previewStore] submitAnswer: question not found: missing-question',
    );
    expect(Object.keys(usePreviewStore.getState().sessions)).toEqual([sessionId]);
  });
});
