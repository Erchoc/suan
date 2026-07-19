import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Question, ReviewResult, ReviewSession, ReviewSource } from '../types';
import { judgeQuestion } from '../utils/judgeAnswer';

const STORAGE_KEY = 'suandao-review';
const MAX_SESSIONS = 10;

interface ReviewStore {
  sessions: Record<string, ReviewSession>;

  createSession(
    sources: ReviewSource[],
    questions: Question[],
    questionBankVersion?: number,
  ): string;
  setAnswer(sessionId: string, questionId: string, answers: string[]): void;
  setChoiceAnswer(sessionId: string, questionId: string, label: string): void;
  /** Submits one question and returns its result. */
  submitAnswer(sessionId: string, questionId: string): ReviewResult;
  toggleBookmark(sessionId: string, questionId: string): void;
  setIssueReport(sessionId: string, questionId: string, reason: string): void;
  completeSession(sessionId: string): void;
  getSession(sessionId: string): ReviewSession | null;
}

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set, get) => ({
      sessions: {},

      createSession: (sources, questions, questionBankVersion) => {
        const sessionId = crypto.randomUUID();
        const session: ReviewSession = {
          sessionId,
          sources,
          questions,
          questionBankVersion,
          answers: {},
          choiceAnswers: {},
          results: {},
          bookmarks: [],
          issueReports: {},
          startedAt: Date.now(),
        };
        set(state => {
          const sessions = { ...state.sessions, [sessionId]: session };
          // Remove the oldest sessions when the limit is exceeded.
          const ids = Object.keys(sessions).sort(
            (a, b) => (sessions[a].startedAt ?? 0) - (sessions[b].startedAt ?? 0),
          );
          if (ids.length > MAX_SESSIONS) {
            ids.slice(0, ids.length - MAX_SESSIONS).forEach(id => delete sessions[id]);
          }
          return { sessions };
        });
        return sessionId;
      },

      setAnswer: (sessionId, questionId, answers) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, answers: { ...session.answers, [questionId]: answers } },
            },
          };
        }),

      setChoiceAnswer: (sessionId, questionId, label) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                choiceAnswers: { ...session.choiceAnswers, [questionId]: label },
              },
            },
          };
        }),

      submitAnswer: (sessionId, questionId) => {
        // Read state inside the set callback to avoid a stale closure snapshot.
        let result: ReviewResult = 'wrong';
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const q = session.questions.find(q => q.id === questionId);
          if (!q) return state;
          const isCorrect = judgeQuestion(
            q,
            session.answers[questionId] ?? [],
            session.choiceAnswers[questionId],
          );
          result = isCorrect ? 'correct' : 'wrong';
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                results: { ...session.results, [questionId]: result },
              },
            },
          };
        });
        return result;
      },

      toggleBookmark: (sessionId, questionId) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const bookmarks = session.bookmarks.includes(questionId)
            ? session.bookmarks.filter(id => id !== questionId)
            : [...session.bookmarks, questionId];
          return {
            sessions: { ...state.sessions, [sessionId]: { ...session, bookmarks } },
          };
        }),

      setIssueReport: (sessionId, questionId, reason) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const issueReports = { ...session.issueReports };
          if (reason.trim()) issueReports[questionId] = reason;
          else delete issueReports[questionId];
          return {
            sessions: { ...state.sessions, [sessionId]: { ...session, issueReports } },
          };
        }),

      completeSession: sessionId =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, completedAt: Date.now() },
            },
          };
        }),

      getSession: sessionId => get().sessions[sessionId] ?? null,
    }),
    { name: STORAGE_KEY },
  ),
);
