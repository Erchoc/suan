import type { KPWithContext } from '../data/kpIndex';
import { getFullDepsChain } from '../data/kpIndex';

export type QuestionTypeMode = 'fill_blank' | 'choice' | 'mixed';

export interface PromptOptions {
  count?: number;
  difficulties?: ('easy' | 'medium' | 'hard')[];
  questionType?: QuestionTypeMode;
}

function getKPHeader(kp: KPWithContext): string {
  const deps = getFullDepsChain(kp.id);
  const depsDesc = deps.length > 0
    ? `\n前置知识点：${deps.map(d => `${d.name}(${d.id})`).join('、')}`
    : '';

  return `知识点信息：
- ID: ${kp.id}
- 名称: ${kp.name}
- 年级: ${kp.gradeName}（${kp.gradeNum}年级${kp.unitSemester}学期）
- 所属领域: ${kp.domainName}
- 所属单元: ${kp.unitName}${depsDesc}`;
}

/**
 * 构造填空题 Prompt（兼容存量逻辑）
 */
export function buildQuestionPrompt(kp: KPWithContext, opts: PromptOptions = {}): string {
  const { count = 10, difficulties = ['easy', 'medium', 'hard'] } = opts;

  const diffMap = { easy: '简单', medium: '中等', hard: '困难' };
  const diffDesc = difficulties.map(d => diffMap[d]).join('、');

  return `你是一位专业的小学数学教师，请为以下知识点出 ${count} 道填空题。

${getKPHeader(kp)}

要求：
1. 每道题只考察本知识点，不超出小学范围
2. 难度分布：${diffDesc}，共 ${count} 道
3. 题目必须是填空题，用 ____ 表示填空处（一道题最多3个填空）
4. 计算结果必须正确，答案精确
5. 每题提供完整解题过程和常见错误分析

请严格按以下 JSON 格式输出（不要有任何其他文字）：
[
  {
    "id": "${kp.id}-01",
    "kp_id": "${kp.id}",
    "kp_name": "${kp.name}",
    "grade": "${kp.gradeName}",
    "semester": "${kp.unitSemester}学期",
    "difficulty": "easy",
    "type": "fill_blank",
    "question": "题目正文，____ 表示填空处",
    "blanks": ["答案1"],
    "solution": "完整解题过程",
    "common_mistake": "学生常见的错误",
    "hint": "解题提示"
  }
]`;
}

/**
 * 构造选择题 Prompt
 */
export function buildChoiceQuestionPrompt(kp: KPWithContext, opts: PromptOptions = {}): string {
  const { count = 10, difficulties = ['easy', 'medium', 'hard'] } = opts;

  const diffMap = { easy: '简单', medium: '中等', hard: '困难' };
  const diffDesc = difficulties.map(d => diffMap[d]).join('、');

  return `你是一位专业的小学数学教师，请为以下知识点出 ${count} 道选择题（4选1）。

${getKPHeader(kp)}

要求：
1. 每道题只考察本知识点，不超出小学范围
2. 难度分布：${diffDesc}，共 ${count} 道
3. 每题 4 个选项（A/B/C/D），只有 1 个正确答案
4. 干扰项应为学生常见错误答案，具有迷惑性
5. 计算结果必须正确
6. 每题提供完整解题过程和常见错误分析

请严格按以下 JSON 格式输出（只输出 JSON 数组，不要有任何其他文字、不要有 markdown 代码块）：
[
  {
    "id": "${kp.id}-01",
    "kp_id": "${kp.id}",
    "kp_name": "${kp.name}",
    "grade": "${kp.gradeName}",
    "semester": "${kp.unitSemester}学期",
    "difficulty": "easy",
    "type": "choice",
    "question": "题目正文",
    "blanks": [],
    "choices": [
      { "label": "A", "content": "选项内容" },
      { "label": "B", "content": "选项内容" },
      { "label": "C", "content": "选项内容" },
      { "label": "D", "content": "选项内容" }
    ],
    "correctChoice": "A",
    "solution": "完整解题过程",
    "common_mistake": "学生常见的错误",
    "hint": "解题提示"
  }
]`;
}

/**
 * 构造混合题 Prompt（先选择再填空）
 */
export function buildMixedQuestionPrompt(kp: KPWithContext, opts: PromptOptions = {}): string {
  const { count = 10, difficulties = ['easy', 'medium', 'hard'] } = opts;

  const diffMap = { easy: '简单', medium: '中等', hard: '困难' };
  const diffDesc = difficulties.map(d => diffMap[d]).join('、');

  return `你是一位专业的小学数学教师，请为以下知识点出 ${count} 道综合题。
综合题 = 先选择正确选项，再填写计算过程或结果（两步作答）。

${getKPHeader(kp)}

要求：
1. 每道题只考察本知识点，不超出小学范围
2. 难度分布：${diffDesc}，共 ${count} 道
3. 每题分两步：第一步选择（4选1），第二步填空（用 ____ 表示，1-2个空）
4. 例如："选出正确的算式，并写出计算结果"
5. 计算结果必须正确
6. 每题提供完整解题过程和常见错误分析

请严格按以下 JSON 格式输出（只输出 JSON 数组，不要有任何其他文字、不要有 markdown 代码块）：
[
  {
    "id": "${kp.id}-01",
    "kp_id": "${kp.id}",
    "kp_name": "${kp.name}",
    "grade": "${kp.gradeName}",
    "semester": "${kp.unitSemester}学期",
    "difficulty": "easy",
    "type": "mixed",
    "question": "题目正文，____ 表示填空处",
    "blanks": ["填空答案"],
    "choices": [
      { "label": "A", "content": "选项内容" },
      { "label": "B", "content": "选项内容" },
      { "label": "C", "content": "选项内容" },
      { "label": "D", "content": "选项内容" }
    ],
    "correctChoice": "A",
    "solution": "完整解题过程",
    "common_mistake": "学生常见的错误",
    "hint": "解题提示"
  }
]`;
}
