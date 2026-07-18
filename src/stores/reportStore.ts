import { create } from 'zustand';
import type { ReportData, KPStat } from '../types';
import type { ExamSession } from '../types';
import { judgeQuestion } from '../utils/judgeAnswer';

interface ReportStore {
  reports: Record<string, ReportData>;
  buildReport: (session: ExamSession) => ReportData;
  getReport: (sessionId: string) => ReportData | null;
}

export const useReportStore = create<ReportStore>()((set, get) => ({
  reports: {},

  buildReport: (session) => {
    const kpStatsMap = new Map<string, KPStat>();

    session.questions.forEach(q => {
      const existing = kpStatsMap.get(q.kp_id) ?? {
        kpId: q.kp_id,
        kpName: q.kp_name,
        grade: q.grade,
        total: 0,
        correct: 0,
        errorRate: 0,
      };
      existing.total += 1;
      if (judgeQuestion(q, session.answers[q.id] ?? [], session.choiceAnswers?.[q.id])) {
        existing.correct += 1;
      }
      kpStatsMap.set(q.kp_id, existing);
    });

    const kpStats = Array.from(kpStatsMap.values()).map(stat => ({
      ...stat,
      errorRate: stat.total > 0 ? (stat.total - stat.correct) / stat.total : 0,
    }));

    const totalQuestions = session.questions.length;
    const correctCount = kpStats.reduce((sum, s) => sum + s.correct, 0);
    const duration = session.submittedAt && session.startedAt
      ? session.submittedAt - session.startedAt
      : 0;

    const report: ReportData = {
      sessionId: session.sessionId,
      totalQuestions,
      correctCount,
      duration,
      kpStats,
    };

    set(state => ({ reports: { ...state.reports, [session.sessionId]: report } }));
    return report;
  },

  getReport: (sessionId) => get().reports[sessionId] ?? null,
}));
