import { beforeEach, describe, expect, it } from 'vitest';
import type { ExamConfig, ExamSession, Question } from '../types';
import { useReportStore } from './reportStore';

const config: ExamConfig = {
  gradeNum: 1,
  semester: '上',
  scope: 'full',
  selectedUnitIds: new Set(),
  difficulty: 'random',
  questionCount: 3,
  timeLimitMinutes: 60,
  filterChineseInput: false,
};

function createQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'question-1',
    kp_id: 'kp-1',
    kp_name: 'Addition',
    grade: 'Grade 1',
    semester: 'First semester',
    difficulty: 'easy',
    type: 'fill_blank',
    question: '1 + 1 = ____',
    blanks: ['2'],
    solution: 'Add the two numbers.',
    common_mistake: 'Counting only one addend.',
    hint: 'Count one more after 1.',
    ...overrides,
  };
}

function createSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    sessionId: 'session-1',
    config,
    questions: [],
    answers: {},
    choiceAnswers: {},
    issueReports: {},
    bookmarks: new Set(),
    startedAt: 1_000,
    submittedAt: 7_000,
    ...overrides,
  };
}

describe('reportStore', () => {
  beforeEach(() => {
    useReportStore.setState({ reports: {} });
  });

  it('aggregates correctness and error rates by knowledge point', () => {
    const questions = [
      createQuestion({ id: 'fill-correct' }),
      createQuestion({ id: 'choice-wrong', type: 'choice', blanks: [], correctChoice: 'B' }),
      createQuestion({
        id: 'mixed-correct',
        kp_id: 'kp-2',
        kp_name: 'Subtraction',
        type: 'mixed',
        blanks: ['3'],
        correctChoice: 'C',
      }),
    ];
    const session = createSession({
      questions,
      answers: {
        'fill-correct': [' 2 '],
        'mixed-correct': ['3'],
      },
      choiceAnswers: {
        'choice-wrong': 'A',
        'mixed-correct': 'C',
      },
    });

    const report = useReportStore.getState().buildReport(session);

    expect(report).toMatchObject({
      sessionId: 'session-1',
      totalQuestions: 3,
      correctCount: 2,
      duration: 6_000,
    });
    expect(report.kpStats).toEqual([
      {
        kpId: 'kp-1',
        kpName: 'Addition',
        grade: 'Grade 1',
        total: 2,
        correct: 1,
        errorRate: 0.5,
      },
      {
        kpId: 'kp-2',
        kpName: 'Subtraction',
        grade: 'Grade 1',
        total: 1,
        correct: 1,
        errorRate: 0,
      },
    ]);
  });

  it('stores reports by session and returns null for an unknown session', () => {
    const session = createSession({
      sessionId: 'stored-session',
      questions: [createQuestion({ id: 'unanswered' })],
      startedAt: null,
      submittedAt: null,
    });

    const report = useReportStore.getState().buildReport(session);

    expect(report).toMatchObject({ correctCount: 0, duration: 0 });
    expect(useReportStore.getState().getReport('stored-session')).toBe(report);
    expect(useReportStore.getState().getReport('missing-session')).toBeNull();
  });
});
