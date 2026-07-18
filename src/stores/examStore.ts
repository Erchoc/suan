import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StorageValue } from 'zustand/middleware';
import type { ExamConfig, ExamSession, Question, DifficultyLevel } from '../types';

// ─── 全局异常题目标记（localStorage，选题时排除）─────────────────────────────
const FLAGGED_KEY = 'suandao-flagged-questions';

export function getFlaggedQuestions(): Set<string> {
  try {
    const raw = localStorage.getItem(FLAGGED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addFlaggedQuestion(questionId: string) {
  const set = getFlaggedQuestions();
  set.add(questionId);
  localStorage.setItem(FLAGGED_KEY, JSON.stringify([...set]));
}

function removeFlaggedQuestion(questionId: string) {
  const set = getFlaggedQuestions();
  set.delete(questionId);
  localStorage.setItem(FLAGGED_KEY, JSON.stringify([...set]));
}

interface ExamStore {
  config: ExamConfig;
  sessions: Record<string, ExamSession>;
  activeSessionId: string | null;

  setGrade: (gradeNum: number) => void;
  setSemester: (semester: '上' | '下') => void;
  setScope: (scope: 'full' | 'current') => void;
  toggleUnit: (unitId: string) => void;
  selectOnlyCurrent: (currentUnitIds: string[]) => void;
  selectAll: () => void;
  clearAll: () => void;
  setDifficulty: (difficulty: DifficultyLevel) => void;
  setQuestionCount: (count: number) => void;
  setTimeLimit: (minutes: number) => void;
  setFilterChineseInput: (value: boolean) => void;

  createSession: (questions: Question[]) => string;
  startSession: (sessionId: string) => void;
  setAnswer: (sessionId: string, questionId: string, answers: string[]) => void;
  setChoiceAnswer: (sessionId: string, questionId: string, label: string) => void;
  setIssueReport: (sessionId: string, questionId: string, reason: string) => void;
  toggleBookmark: (sessionId: string, questionId: string) => void;
  submitSession: (sessionId: string) => void;
  saveQuestionIndex: (sessionId: string, index: number) => void;
  getSession: (sessionId: string) => ExamSession | null;
  resetConfig: () => void;
}

const defaultConfig: ExamConfig = {
  gradeNum: null,
  semester: null,
  scope: 'full',
  selectedUnitIds: new Set(),
  difficulty: 'random',
  questionCount: 50,
  timeLimitMinutes: 60,
  filterChineseInput: false,
};

export const useExamStore = create<ExamStore>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      sessions: {},
      activeSessionId: null,

      setGrade: (gradeNum) =>
        set(state => ({
          config: {
            ...state.config,
            gradeNum,
            semester: null,
            selectedUnitIds: new Set(),
            // 切换年级时：4-6年级不需要过滤（强制关闭）；1-3年级保持用户当前设置不变
            filterChineseInput: gradeNum > 3 ? false : state.config.filterChineseInput,
          },
        })),

      setSemester: (semester) =>
        set(state => ({
          config: { ...state.config, semester, selectedUnitIds: new Set() },
        })),

      setScope: (scope) =>
        set(state => ({ config: { ...state.config, scope } })),

      toggleUnit: (unitId) =>
        set(state => {
          const ids = new Set(state.config.selectedUnitIds);
          if (ids.has(unitId)) ids.delete(unitId);
          else ids.add(unitId);
          return { config: { ...state.config, selectedUnitIds: ids } };
        }),

      selectOnlyCurrent: (currentUnitIds) =>
        set(state => ({
          config: { ...state.config, selectedUnitIds: new Set(currentUnitIds) },
        })),

      selectAll: () =>
        set(state => ({ config: { ...state.config, selectedUnitIds: new Set() } })),

      clearAll: () =>
        set(state => ({ config: { ...state.config, selectedUnitIds: new Set(['__none__']) } })),

      setDifficulty: (difficulty) =>
        set(state => ({ config: { ...state.config, difficulty } })),

      setQuestionCount: (questionCount) =>
        set(state => ({ config: { ...state.config, questionCount: Math.max(10, Math.min(200, questionCount)) } })),

      setTimeLimit: (timeLimitMinutes) =>
        set(state => ({ config: { ...state.config, timeLimitMinutes: Math.max(0, Math.min(180, timeLimitMinutes)) } })),

      setFilterChineseInput: (value) =>
        set(state => ({ config: { ...state.config, filterChineseInput: value } })),

      createSession: (questions) => {
        const sessionId = crypto.randomUUID();
        const { config } = get();
        const session: ExamSession = {
          sessionId,
          config: { ...config, selectedUnitIds: new Set(config.selectedUnitIds) },
          questions,
          answers: {},
          choiceAnswers: {},
          issueReports: {},
          bookmarks: new Set(),
          startedAt: null,
          submittedAt: null,
        };
        set(state => ({
          sessions: { ...state.sessions, [sessionId]: session },
          activeSessionId: sessionId,
        }));
        return sessionId;
      },

      startSession: (sessionId) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session || session.startedAt) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, startedAt: Date.now() },
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
              [sessionId]: {
                ...session,
                answers: { ...session.answers, [questionId]: answers },
              },
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

      setIssueReport: (sessionId, questionId, reason) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const issueReports = { ...session.issueReports };
          if (reason.trim()) {
            issueReports[questionId] = reason;
            // 同步写入全局异常题目标记（本地选题时排除）
            addFlaggedQuestion(questionId);
          } else {
            delete issueReports[questionId];
            removeFlaggedQuestion(questionId);
          }
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, issueReports },
            },
          };
        }),

      toggleBookmark: (sessionId, questionId) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          const bookmarks = new Set(session.bookmarks);
          if (bookmarks.has(questionId)) bookmarks.delete(questionId);
          else bookmarks.add(questionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, bookmarks },
            },
          };
        }),

      submitSession: (sessionId) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, submittedAt: Date.now() },
            },
          };
        }),

      saveQuestionIndex: (sessionId, index) =>
        set(state => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, lastQuestionIndex: index },
            },
          };
        }),

      getSession: (sessionId) => get().sessions[sessionId] ?? null,

      resetConfig: () => set({ config: defaultConfig }),
    }),
    {
      name: 'suandao-exam',
      partialize: (state) => ({ sessions: state.sessions }),
      // Set 序列化处理
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const data = JSON.parse(str) as StorageValue<Pick<ExamStore, 'sessions'>>;
          // 反序列化 sessions 中的 Set
          if (data.state?.sessions) {
            Object.values(data.state.sessions).forEach(s => {
              s.bookmarks = new Set(s.bookmarks ?? []);
              if (s.config?.selectedUnitIds) {
                s.config.selectedUnitIds = new Set(s.config.selectedUnitIds);
              }
            });
          }
          return data;
        },
        setItem: (name, value) => {
          // 序列化 sessions 中的 Set
          const serialized = JSON.parse(JSON.stringify(value, (_key, val) => {
            if (val instanceof Set) return [...val];
            return val;
          }));
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
