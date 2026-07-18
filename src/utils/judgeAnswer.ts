import type { Question, QuestionType } from '../types';

export function judgeBlanks(userAnswers: string[], correctBlanks: string[]): boolean {
  if (userAnswers.length !== correctBlanks.length) return false;
  return userAnswers.every((ans, i) => {
    const user = ans.trim().replace(/\s+/g, '');
    const correct = correctBlanks[i].trim().replace(/\s+/g, '');
    return user === correct;
  });
}

export function judgeQuestion(
  q: Question,
  answers: string[],
  choiceAnswer: string | undefined,
): boolean {
  const qType: QuestionType = q.type || 'fill_blank';
  switch (qType) {
    case 'fill_blank':
      return judgeBlanks(answers, q.blanks);
    case 'choice':
      return !!choiceAnswer && choiceAnswer === q.correctChoice;
    case 'mixed':
      return !!choiceAnswer && choiceAnswer === q.correctChoice && judgeBlanks(answers, q.blanks);
    default:
      return judgeBlanks(answers, q.blanks);
  }
}
