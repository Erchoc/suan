import { describe, expect, it } from 'vitest';
import { buildQuestionBankSeedSql } from './seedQuestionBank';

const question = {
  id: "1-1-o'clock",
  kp_id: '1-1',
  kp_name: 'Counting',
  grade: 'Grade 1',
  semester: 'First semester',
  difficulty: 'easy',
  question: "What's next? ____",
  blanks: ['2'],
  solution: 'Count once.',
  common_mistake: 'Skipping a number.',
  hint: 'Count aloud.',
  enable: true,
};

describe('question-bank seed generation', () => {
  it('generates repeatable insert-only SQL and normalizes legacy question types', () => {
    const result = buildQuestionBankSeedSql(JSON.stringify([question]));

    expect(result.total).toBe(1);
    expect(result.enabled).toBe(1);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.sql).toContain('INSERT OR IGNORE INTO questions');
    expect(result.sql).toContain("'fill_blank'");
    expect(result.sql).toContain("o''clock");
    expect(result.sql).toContain('WHERE NOT EXISTS');
  });

  it('rejects malformed top-level data and malformed questions', () => {
    expect(() => buildQuestionBankSeedSql('{}')).toThrow('Question data must be an array');
    expect(() => buildQuestionBankSeedSql('[{"id":"broken"}]')).toThrow('invalid kp_id');
  });
});
