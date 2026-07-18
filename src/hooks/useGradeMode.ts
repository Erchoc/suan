// src/hooks/useGradeMode.ts
import type { Question } from '../types';

export interface GradeMode {
  isJunior: boolean; // gradeNum <= 3
  questionCount: number; // Maximum number of questions to select.
  fontSize: string; // Tailwind font-size class.
}

export function useGradeMode(gradeNum: number, kpQuestions: Question[]): GradeMode {
  const isJunior = gradeNum <= 3;
  return {
    isJunior,
    questionCount: isJunior ? Math.min(3, kpQuestions.length) : Math.min(8, kpQuestions.length),
    fontSize: isJunior ? 'text-lg' : 'text-base',
  };
}
