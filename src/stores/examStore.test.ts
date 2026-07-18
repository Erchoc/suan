import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamConfig, Question } from '../types';
import { getFlaggedQuestions, useExamStore } from './examStore';

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

function createConfig(overrides: Partial<ExamConfig> = {}): ExamConfig {
  return {
    gradeNum: null,
    semester: null,
    scope: 'full',
    selectedUnitIds: new Set(),
    difficulty: 'random',
    questionCount: 50,
    timeLimitMinutes: 60,
    filterChineseInput: false,
    ...overrides,
  };
}

function createQuestion(): Question {
  return {
    id: 'exam-question',
    kp_id: 'kp-1',
    kp_name: 'Addition',
    grade: 'Grade 1',
    semester: 'First semester',
    difficulty: 'easy',
    type: 'choice',
    question: 'Which result equals 1 + 1?',
    blanks: [],
    correctChoice: 'B',
    solution: 'Add one and one.',
    common_mistake: 'Counting only one addend.',
    hint: 'Count one more after 1.',
  };
}

describe('examStore configuration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useExamStore.setState({
      config: createConfig(),
      sessions: {},
      activeSessionId: null,
    });
    memoryStorage.clear();
  });

  it('clamps numeric settings to their supported ranges', () => {
    useExamStore.getState().setQuestionCount(1);
    expect(useExamStore.getState().config.questionCount).toBe(10);
    useExamStore.getState().setQuestionCount(500);
    expect(useExamStore.getState().config.questionCount).toBe(200);

    useExamStore.getState().setTimeLimit(-1);
    expect(useExamStore.getState().config.timeLimitMinutes).toBe(0);
    useExamStore.getState().setTimeLimit(500);
    expect(useExamStore.getState().config.timeLimitMinutes).toBe(180);
  });

  it('resets dependent selections when grade or semester changes', () => {
    useExamStore.setState({
      config: createConfig({
        semester: '上',
        selectedUnitIds: new Set(['unit-1']),
        filterChineseInput: true,
      }),
    });

    useExamStore.getState().setGrade(4);
    expect(useExamStore.getState().config).toMatchObject({
      gradeNum: 4,
      semester: null,
      filterChineseInput: false,
    });
    expect(useExamStore.getState().config.selectedUnitIds.size).toBe(0);

    useExamStore.getState().setFilterChineseInput(true);
    useExamStore.getState().setGrade(2);
    expect(useExamStore.getState().config.filterChineseInput).toBe(true);
    useExamStore.getState().toggleUnit('unit-2');
    useExamStore.getState().setSemester('下');
    expect(useExamStore.getState().config.selectedUnitIds.size).toBe(0);
  });

  it('supports unit selection shortcuts and toggling', () => {
    useExamStore.getState().toggleUnit('unit-1');
    expect(useExamStore.getState().config.selectedUnitIds).toEqual(new Set(['unit-1']));
    useExamStore.getState().toggleUnit('unit-1');
    expect(useExamStore.getState().config.selectedUnitIds.size).toBe(0);

    useExamStore.getState().selectOnlyCurrent(['unit-2', 'unit-3']);
    expect(useExamStore.getState().config.selectedUnitIds).toEqual(new Set(['unit-2', 'unit-3']));
    useExamStore.getState().clearAll();
    expect(useExamStore.getState().config.selectedUnitIds).toEqual(new Set(['__none__']));
    useExamStore.getState().selectAll();
    expect(useExamStore.getState().config.selectedUnitIds.size).toBe(0);
  });
});

describe('examStore sessions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useExamStore.setState({
      config: createConfig({ selectedUnitIds: new Set(['unit-1']) }),
      sessions: {},
      activeSessionId: null,
    });
    memoryStorage.clear();
  });

  it('moves a session from creation through submission and persists its sets', () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const question = createQuestion();
    const sessionId = useExamStore.getState().createSession([question]);

    const created = useExamStore.getState().getSession(sessionId);
    expect(created?.config.selectedUnitIds).toEqual(new Set(['unit-1']));
    expect(created?.config.selectedUnitIds).not.toBe(
      useExamStore.getState().config.selectedUnitIds,
    );
    expect(useExamStore.getState().activeSessionId).toBe(sessionId);

    useExamStore.getState().startSession(sessionId);
    useExamStore.getState().startSession(sessionId);
    useExamStore.getState().setAnswer(sessionId, question.id, []);
    useExamStore.getState().setChoiceAnswer(sessionId, question.id, 'B');
    useExamStore.getState().toggleBookmark(sessionId, question.id);
    useExamStore.getState().setIssueReport(sessionId, question.id, 'Incorrect source data');
    useExamStore.getState().saveQuestionIndex(sessionId, 4);
    now = 5_000;
    useExamStore.getState().submitSession(sessionId);

    expect(useExamStore.getState().getSession(sessionId)).toMatchObject({
      startedAt: 1_000,
      submittedAt: 5_000,
      answers: { [question.id]: [] },
      choiceAnswers: { [question.id]: 'B' },
      issueReports: { [question.id]: 'Incorrect source data' },
      lastQuestionIndex: 4,
    });
    expect(useExamStore.getState().getSession(sessionId)?.bookmarks).toEqual(
      new Set([question.id]),
    );
    expect(getFlaggedQuestions()).toEqual(new Set([question.id]));

    const persisted = JSON.parse(memoryStorage.getItem('suandao-exam') ?? '{}');
    expect(persisted.state.sessions[sessionId].bookmarks).toEqual([question.id]);
    expect(persisted.state.sessions[sessionId].config.selectedUnitIds).toEqual(['unit-1']);
  });

  it('rehydrates persisted session collections as Set instances', async () => {
    const question = createQuestion();
    const sessionId = 'persisted-session';
    memoryStorage.setItem(
      'suandao-exam',
      JSON.stringify({
        state: {
          sessions: {
            [sessionId]: {
              sessionId,
              config: {
                ...createConfig(),
                selectedUnitIds: ['unit-1', 'unit-2'],
              },
              questions: [question],
              answers: {},
              choiceAnswers: {},
              issueReports: {},
              bookmarks: [question.id],
              startedAt: 1_000,
              submittedAt: null,
            },
          },
        },
        version: 0,
      }),
    );

    await useExamStore.persist.rehydrate();

    const restored = useExamStore.getState().getSession(sessionId);
    expect(restored?.bookmarks).toBeInstanceOf(Set);
    expect(restored?.bookmarks).toEqual(new Set([question.id]));
    expect(restored?.config.selectedUnitIds).toBeInstanceOf(Set);
    expect(restored?.config.selectedUnitIds).toEqual(new Set(['unit-1', 'unit-2']));
  });

  it('removes bookmarks and issue flags when they are cleared', () => {
    const question = createQuestion();
    const sessionId = useExamStore.getState().createSession([question]);

    useExamStore.getState().toggleBookmark(sessionId, question.id);
    useExamStore.getState().toggleBookmark(sessionId, question.id);
    useExamStore.getState().setIssueReport(sessionId, question.id, 'Issue');
    useExamStore.getState().setIssueReport(sessionId, question.id, '   ');

    expect(useExamStore.getState().getSession(sessionId)?.bookmarks.size).toBe(0);
    expect(useExamStore.getState().getSession(sessionId)?.issueReports).toEqual({});
    expect(getFlaggedQuestions()).toEqual(new Set());
  });

  it('ignores mutations for missing sessions', () => {
    const initialState = useExamStore.getState();

    initialState.startSession('missing-session');
    initialState.setAnswer('missing-session', 'question', ['1']);
    initialState.setChoiceAnswer('missing-session', 'question', 'A');
    initialState.setIssueReport('missing-session', 'question', 'Issue');
    initialState.toggleBookmark('missing-session', 'question');
    initialState.submitSession('missing-session');
    initialState.saveQuestionIndex('missing-session', 2);

    expect(useExamStore.getState().sessions).toEqual({});
    expect(useExamStore.getState().getSession('missing-session')).toBeNull();
  });

  it('returns an empty flag set when persisted data is malformed', () => {
    memoryStorage.setItem('suandao-flagged-questions', 'not-json');

    expect(getFlaggedQuestions()).toEqual(new Set());
  });
});
