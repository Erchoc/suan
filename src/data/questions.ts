import type { Question } from '../types';

let cachedQuestions: Question[] | null = null;
let pendingQuestions: Promise<Question[]> | null = null;
let questionsById = new Map<string, Question>();

interface QuestionBankResponse {
  data: unknown;
}

function isQuestion(value: unknown): value is Question {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { id?: unknown; kp_id?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.kp_id === 'string';
}

export function getCachedQuestionById(questionId: string): Question | undefined {
  return questionsById.get(questionId);
}

async function fetchPublishedQuestions(): Promise<unknown> {
  const response = await fetch('/api/questions');
  if (!response.ok) throw new Error(`D1 question bank unavailable: ${response.status}`);
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new Error('D1 question bank response is invalid');
  }
  return (payload as QuestionBankResponse).data;
}

export function loadQuestions(): Promise<Question[]> {
  if (cachedQuestions) return Promise.resolve(cachedQuestions);
  if (pendingQuestions) return pendingQuestions;

  pendingQuestions = fetchPublishedQuestions()
    .then(data => {
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

export async function loadQuestion(questionId: string): Promise<Question | undefined> {
  const cached = getCachedQuestionById(questionId);
  if (cached) return cached;

  const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`D1 question unavailable: ${response.status}`);
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new Error('D1 question response is invalid');
  }
  const question = (payload as QuestionBankResponse).data;
  if (!isQuestion(question) || question.enable === false) return undefined;
  questionsById.set(question.id, question);
  return question;
}
