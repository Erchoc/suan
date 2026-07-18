import { describe, expect, it } from 'vitest';
import { kpMap } from '../data/kpIndex';
import {
  buildChoiceQuestionPrompt,
  buildMixedQuestionPrompt,
  buildQuestionPrompt,
} from './promptBuilder';

function getKnowledgePoint(id: string) {
  const knowledgePoint = kpMap.get(id);
  if (!knowledgePoint) throw new Error(`Missing test knowledge point: ${id}`);
  return knowledgePoint;
}

describe('question prompt builders', () => {
  it('builds the default fill-in-the-blank contract', () => {
    const knowledgePoint = getKnowledgePoint('1-1');
    const prompt = buildQuestionPrompt(knowledgePoint);

    expect(prompt).toContain('出 10 道填空题');
    expect(prompt).toContain('难度分布：简单、中等、困难，共 10 道');
    expect(prompt).toContain(`- ID: ${knowledgePoint.id}`);
    expect(prompt).toContain(`"kp_name": "${knowledgePoint.name}"`);
    expect(prompt).toContain('"type": "fill_blank"');
    expect(prompt).not.toContain('前置知识点：');
  });

  it('includes custom count, difficulty, and prerequisite context', () => {
    const knowledgePoint = getKnowledgePoint('1-5');
    const prerequisite = getKnowledgePoint('1-4');
    const prompt = buildQuestionPrompt(knowledgePoint, {
      count: 3,
      difficulties: ['easy', 'hard'],
    });

    expect(prompt).toContain('出 3 道填空题');
    expect(prompt).toContain('难度分布：简单、困难，共 3 道');
    expect(prompt).toContain(`前置知识点：${prerequisite.name}(${prerequisite.id})`);
  });

  it('builds the multiple-choice schema with four labeled choices', () => {
    const prompt = buildChoiceQuestionPrompt(getKnowledgePoint('1-1'), {
      count: 2,
      difficulties: ['medium'],
    });
    const defaultPrompt = buildChoiceQuestionPrompt(getKnowledgePoint('1-1'));

    expect(prompt).toContain('出 2 道选择题（4选1）');
    expect(prompt).toContain('难度分布：中等，共 2 道');
    expect(defaultPrompt).toContain('出 10 道选择题（4选1）');
    expect(defaultPrompt).toContain('难度分布：简单、中等、困难，共 10 道');
    expect(prompt).toContain('"type": "choice"');
    for (const label of ['A', 'B', 'C', 'D']) {
      expect(prompt).toContain(`"label": "${label}"`);
    }
    expect(prompt).toContain('"correctChoice": "A"');
  });

  it('builds the two-step mixed-question contract', () => {
    const prompt = buildMixedQuestionPrompt(getKnowledgePoint('1-1'));
    const customPrompt = buildMixedQuestionPrompt(getKnowledgePoint('1-1'), {
      count: 4,
      difficulties: ['hard'],
    });

    expect(prompt).toContain('综合题 = 先选择正确选项，再填写计算过程或结果（两步作答）');
    expect(customPrompt).toContain('出 4 道综合题');
    expect(customPrompt).toContain('难度分布：困难，共 4 道');
    expect(prompt).toContain('第一步选择（4选1），第二步填空');
    expect(prompt).toContain('"type": "mixed"');
    expect(prompt).toContain('"correctChoice": "A"');
  });
});
