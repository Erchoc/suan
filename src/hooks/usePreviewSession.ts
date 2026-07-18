// src/hooks/usePreviewSession.ts
import { useMemo } from 'react';
import { type KPWithContext, kpMap } from '../data/kpIndex';
import { usePreviewStore } from '../stores/previewStore';
import type { KnowledgeCard, PreviewSession, Question } from '../types';
import { useQuestions } from './useQuestions';

export interface PreviewSessionData {
  session: PreviewSession | null;
  currentKp: KPWithContext | null;
  currentCard: KnowledgeCard | null; // Null triggers the fallback UI.
  currentQuestions: Question[]; // Limited to questionCount entries.
  questionsLoading: boolean;
  isJunior: boolean;
  progress: { current: number; total: number };
}

export function usePreviewSession(sessionId: string): PreviewSessionData {
  const session = usePreviewStore(s => s.getSession(sessionId));
  const cards = usePreviewStore(s => s.cards);
  const { questions, loading: questionsLoading } = useQuestions();

  return useMemo(() => {
    if (!session) {
      return {
        session: null,
        currentKp: null,
        currentCard: null,
        currentQuestions: [],
        questionsLoading,
        isJunior: false,
        progress: { current: 0, total: 0 },
      };
    }

    const kpId = session.kpIds[session.currentKpIndex];
    const currentKp = kpMap.get(kpId) ?? null;
    const currentCard = cards[kpId] ?? null;
    const allKpQuestions = questions.filter(question => question.kp_id === kpId);
    const gradeNum = currentKp?.gradeNum ?? 1;
    const isJunior = gradeNum <= 3;
    const questionCount = isJunior
      ? Math.min(3, allKpQuestions.length)
      : Math.min(8, allKpQuestions.length);
    const currentQuestions = allKpQuestions.slice(0, questionCount);

    return {
      session,
      currentKp,
      currentCard,
      currentQuestions,
      questionsLoading,
      isJunior,
      progress: {
        current: session.currentKpIndex + 1,
        total: session.kpIds.length,
      },
    };
  }, [session, cards, questions, questionsLoading]);
}
