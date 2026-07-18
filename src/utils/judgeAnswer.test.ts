import { describe, expect, it } from 'vitest';
import type { Question } from '../types';
import { judgeBlanks, judgeQuestion } from './judgeAnswer';

function createQuestion(overrides: Partial<Question> = {}): Question {
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

describe('judgeBlanks', () => {
  it('ignores leading, trailing, and internal whitespace', () => {
    expect(judgeBlanks([' 1 2 ', '\t3\n'], ['12', ' 3 '])).toBe(true);
  });

  it('requires the same number of answers', () => {
    expect(judgeBlanks(['1'], ['1', '2'])).toBe(false);
  });

  it('compares normalized answers exactly', () => {
    expect(judgeBlanks(['A'], ['a'])).toBe(false);
    expect(judgeBlanks(['1.0'], ['1'])).toBe(false);
  });
});

describe('judgeQuestion', () => {
  it('judges fill-in-the-blank questions from their blank answers', () => {
    const question = createQuestion({ blanks: ['10', '20'] });

    expect(judgeQuestion(question, [' 1 0 ', '20'], undefined)).toBe(true);
    expect(judgeQuestion(question, ['10', '21'], undefined)).toBe(false);
  });

  it('requires the correct selected option for choice questions', () => {
    const question = createQuestion({
      type: 'choice',
      blanks: [],
      correctChoice: 'B',
    });

    expect(judgeQuestion(question, [], undefined)).toBe(false);
    expect(judgeQuestion(question, [], 'A')).toBe(false);
    expect(judgeQuestion(question, [], 'B')).toBe(true);
  });

  it('requires both parts of a mixed question to be correct', () => {
    const question = createQuestion({
      type: 'mixed',
      blanks: ['8'],
      correctChoice: 'C',
    });

    expect(judgeQuestion(question, ['8'], 'C')).toBe(true);
    expect(judgeQuestion(question, ['9'], 'C')).toBe(false);
    expect(judgeQuestion(question, ['8'], 'B')).toBe(false);
    expect(judgeQuestion(question, ['8'], undefined)).toBe(false);
  });

  it('falls back to blank judging for legacy questions without a type', () => {
    const question = createQuestion({ type: undefined as unknown as Question['type'] });

    expect(judgeQuestion(question, ['2'], undefined)).toBe(true);
  });
});
