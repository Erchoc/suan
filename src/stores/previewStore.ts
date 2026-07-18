// src/stores/previewStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KnowledgeCard, PreviewPhase, PreviewSession } from '../types';
import { judgeQuestion } from '../utils/judgeAnswer';
import cardsRaw from '../data/knowledge-cards.json';
import { getCachedQuestionById } from '../data/questions';

// 静态加载知识卡（src/data/knowledge-cards.json，打包进 bundle）
const cardsMap: Record<string, KnowledgeCard> = {};
(cardsRaw as KnowledgeCard[]).forEach(c => { cardsMap[c.kp_id] = c; });

const STORAGE_KEY = 'suandao-preview';
const MAX_SESSIONS = 10;

interface PreviewStore {
  sessions: Record<string, PreviewSession>;
  cards: Record<string, KnowledgeCard>;  // 不持久化

  getSession(sessionId: string): PreviewSession | null;
  createSession(kpIds: string[]): string;
  setPhase(sessionId: string, phase: PreviewPhase): void;
  skipCard(sessionId: string): void;
  setAnswer(sessionId: string, questionId: string, answers: string[]): void;
  setChoiceAnswer(sessionId: string, questionId: string, label: string): void;
  submitAnswer(sessionId: string, questionId: string): 'correct' | 'wrong';
  selectFAQ(sessionId: string, kpId: string, faqIndex: number): void;
  completeKp(sessionId: string): void;
}

export const usePreviewStore = create<PreviewStore>()(
  persist(
    (set, get) => ({
      sessions: {},
      cards: cardsMap,  // 运行时注入，不写入 localStorage

      getSession: (sessionId) => get().sessions[sessionId] ?? null,

      createSession: (kpIds) => {
        const sessionId = crypto.randomUUID();
        const session: PreviewSession = {
          sessionId,
          kpIds,
          currentKpIndex: 0,
          phase: 'card',
          answers: {},
          choiceAnswers: {},
          results: {},
          cardSkippedKps: [],
          faqSelectedIds: {},
          startedAt: Date.now(),
        };
        set(state => {
          const sessions = { ...state.sessions, [sessionId]: session };
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

      setPhase: (sessionId, phase) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return { sessions: { ...state.sessions, [sessionId]: { ...session, phase } } };
        }),

      skipCard: (sessionId) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const kpId = session.kpIds[session.currentKpIndex];
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                cardSkippedKps: session.cardSkippedKps.includes(kpId)
                  ? session.cardSkippedKps
                  : [...session.cardSkippedKps, kpId],
                phase: 'practice',
              },
            },
          };
        }),

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
        const session = get().sessions[sessionId];
        if (!session) return 'wrong';
        const question = getCachedQuestionById(questionId);
        if (!question) {
          console.warn(`[previewStore] submitAnswer: question not found: ${questionId}`);
          return 'wrong';
        }
        const correct = judgeQuestion(
          question,
          session.answers[questionId] ?? [],
          session.choiceAnswers[questionId],
        );
        const result: 'correct' | 'wrong' = correct ? 'correct' : 'wrong';
        set(state => ({
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...state.sessions[sessionId],
              results: { ...state.sessions[sessionId].results, [questionId]: result },
            },
          },
        }));
        return result;
      },

      selectFAQ: (sessionId, kpId, faqIndex) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const existing = session.faqSelectedIds[kpId] ?? [];
          if (existing.includes(faqIndex)) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                faqSelectedIds: {
                  ...session.faqSelectedIds,
                  [kpId]: [...existing, faqIndex],
                },
              },
            },
          };
        }),

      completeKp: (sessionId) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const nextIndex = session.currentKpIndex + 1;
          if (nextIndex >= session.kpIds.length) {
            return {
              sessions: {
                ...state.sessions,
                [sessionId]: { ...session, phase: 'summary', completedAt: Date.now() },
              },
            };
          }
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, currentKpIndex: nextIndex, phase: 'card' },
            },
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ sessions: state.sessions }),
    },
  ),
);
