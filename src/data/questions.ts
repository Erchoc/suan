import type { Question } from '../types';

let cachedQuestions: Question[] | null = null;
let pendingQuestions: Promise<Question[]> | null = null;
let questionsById = new Map<string, Question>();

function isQuestion(value: unknown): value is Question {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { id?: unknown; kp_id?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.kp_id === 'string';
}

export function getCachedQuestionById(questionId: string): Question | undefined {
  return questionsById.get(questionId);
}

export function loadQuestions(): Promise<Question[]> {
  if (cachedQuestions) return Promise.resolve(cachedQuestions);
  if (pendingQuestions) return pendingQuestions;

  pendingQuestions = fetch('/questions.json')
    .then(async response => {
      if (!response.ok) {
        throw new Error(`题库加载失败：${response.status}`);
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('题库格式错误');
      }
      const questions = data.filter(isQuestion).filter(question => question.enable !== false);
      cachedQuestions = questions;
      questionsById = new Map(questions.map(question => [question.id, question]));
      return questions;
    })
    .catch(error => {
      pendingQuestions = null;
      throw error;
    });

  return pendingQuestions;
}
