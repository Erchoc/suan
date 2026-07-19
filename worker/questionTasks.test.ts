import { applyD1Migrations, type D1Migration, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionRecord } from './questionBank';
import {
  applyQualityQuestionBatch,
  buildGenerationPrompt,
  buildQualityPrompt,
  cancelQuestionTask,
  completeQuestionTask,
  createQuestionTask,
  failQuestionTask,
  generateQuestionsForTarget,
  getQuestionTask,
  insertGeneratedQuestionBatch,
  KNOWLEDGE_POINT_TARGETS,
  listQuestionTasks,
  loadQualityQuestionBatch,
  markQuestionTaskRunning,
  parseGeneratedQuestions,
  parseQualityDecisions,
  parseQuestionTaskRequest,
  prepareQualityQuestionIds,
  requestQualityDecisions,
  selectGenerationTargets,
  updateQuestionTaskProgress,
} from './questionTasks';

const NOW = '2026-07-19T00:00:00.000Z';
const LATER = '2026-07-19T00:01:00.000Z';
const testEnv = env as CloudflareBindings & { TEST_MIGRATIONS: D1Migration[] };
const target = KNOWLEDGE_POINT_TARGETS.find(item => item.id === '1-1')!;

function generatedQuestion(id: string, overrides: Partial<QuestionRecord> = {}): QuestionRecord {
  return {
    id,
    kp_id: '1-1',
    kp_name: '数数（1~10）与计数',
    grade: '一年级',
    semester: '上学期',
    difficulty: 'easy',
    type: 'fill_blank',
    question: '1 加 1 等于 ____。',
    blanks: ['2'],
    blank_types: ['number'],
    solution: '把两个 1 合起来得到 2。',
    common_mistake: '漏数一个。',
    hint: '从 1 再数一个。',
    enable: false,
    checkMessage: 'AI 生成，等待质检',
    ...overrides,
  };
}

function generationPayload(): unknown[] {
  const choices = ['1', '2', '3', '4'].map((content, index) => ({
    label: String.fromCharCode(65 + index),
    content,
  }));
  return [
    {
      type: 'fill_blank',
      difficulty: 'easy',
      question: '1 加 1 等于 ____。',
      blanks: ['2'],
      solution: '把两个 1 合起来。',
      common_mistake: '漏数。',
      hint: '继续数一个。',
    },
    {
      type: 'choice',
      difficulty: 'medium',
      question: '下面哪个数表示两个物体？',
      blanks: [],
      choices,
      correctChoice: 'B',
      solution: '两个物体用数字 2 表示。',
      common_mistake: '把位置当数量。',
      hint: '逐个数一数。',
    },
    {
      type: 'mixed',
      difficulty: 'hard',
      question: '选出 2，再填：1 加 1 等于 ____。',
      blanks: ['2'],
      choices,
      correctChoice: 'B',
      solution: '选择 2，填入 2。',
      common_mistake: '只完成一部分。',
      hint: '选择和填空都要完成。',
    },
  ];
}

async function createGenerationTask(taskId = 'task-1'): Promise<void> {
  await createQuestionTask(
    testEnv.CONTENT_DB,
    taskId,
    {
      type: 'generate',
      params: { grade: 1, kpId: '1-1', typeMode: 'auto', countPerKnowledgePoint: 3 },
    },
    NOW,
  );
}

beforeEach(async () => {
  await applyD1Migrations(testEnv.CONTENT_DB, testEnv.TEST_MIGRATIONS);
  await testEnv.CONTENT_DB.batch([
    testEnv.CONTENT_DB.prepare('DELETE FROM question_task_batches'),
    testEnv.CONTENT_DB.prepare('DELETE FROM question_task_events'),
    testEnv.CONTENT_DB.prepare('DELETE FROM question_tasks'),
    testEnv.CONTENT_DB.prepare('DELETE FROM question_audit_logs'),
    testEnv.CONTENT_DB.prepare('DELETE FROM question_reports'),
    testEnv.CONTENT_DB.prepare('DELETE FROM question_bank_releases'),
    testEnv.CONTENT_DB.prepare('DELETE FROM published_question_versions'),
    testEnv.CONTENT_DB.prepare('DELETE FROM published_questions'),
    testEnv.CONTENT_DB.prepare('DELETE FROM questions'),
    testEnv.CONTENT_DB.prepare(
      `UPDATE question_bank_meta SET draft_revision = 0, published_revision = 0,
       source_sha256 = 'test-source', imported_at = ?, published_at = NULL, updated_at = ?
       WHERE singleton_id = 1`,
    ).bind(NOW, NOW),
  ]);
  vi.unstubAllGlobals();
});

describe('question task validation and prompts', () => {
  it('normalizes generation and quality task parameters', () => {
    expect(
      parseQuestionTaskRequest({
        type: 'generate',
        params: {
          grade: 1,
          semester: '上',
          kpId: '1-1',
          typeMode: 'auto',
          countPerKnowledgePoint: 3,
        },
      }),
    ).toEqual({
      type: 'generate',
      params: {
        grade: 1,
        semester: '上',
        kpId: '1-1',
        typeMode: 'auto',
        countPerKnowledgePoint: 3,
      },
    });
    expect(
      parseQuestionTaskRequest({
        type: 'quality',
        params: { scope: 'reported', grade: 2, semester: '下', type: 'choice', limit: 50 },
      }),
    ).toEqual({
      type: 'quality',
      params: { scope: 'reported', grade: 2, semester: '下', type: 'choice', limit: 50 },
    });
    expect(
      parseQuestionTaskRequest({ type: 'quality', params: { scope: 'all', limit: 'all' } }),
    ).toEqual({ type: 'quality', params: { scope: 'all', limit: 'all' } });
  });

  it.each([
    [null, '任务类型不合法'],
    [{ type: 'unknown', params: {} }, '任务类型不合法'],
    [{ type: 'generate', params: null }, 'params 必须是对象'],
    [
      { type: 'generate', params: { grade: 0, typeMode: 'auto', countPerKnowledgePoint: 3 } },
      'grade 不合法',
    ],
    [
      {
        type: 'generate',
        params: { grade: 1, semester: '全年', typeMode: 'auto', countPerKnowledgePoint: 3 },
      },
      'semester 不合法',
    ],
    [
      { type: 'generate', params: { grade: 1, typeMode: 'essay', countPerKnowledgePoint: 3 } },
      'typeMode 不合法',
    ],
    [
      { type: 'generate', params: { grade: 1, typeMode: 'auto', countPerKnowledgePoint: 4 } },
      'countPerKnowledgePoint 不合法',
    ],
    [
      {
        type: 'generate',
        params: { grade: 1, kpId: '2-1', typeMode: 'auto', countPerKnowledgePoint: 3 },
      },
      '知识点不属于当前年级学期',
    ],
    [{ type: 'quality', params: { scope: 'unknown', limit: 20 } }, 'scope 不合法'],
    [{ type: 'quality', params: { scope: 'all', type: 'essay', limit: 20 } }, 'type 不合法'],
    [{ type: 'quality', params: { scope: 'all', limit: 1 } }, 'limit 不合法'],
  ])('rejects invalid task input %#', (input, message) => {
    expect(() => parseQuestionTaskRequest(input)).toThrow(message);
  });

  it('selects bounded knowledge point targets and builds explicit AI prompts', () => {
    const allGradeOne = selectGenerationTargets({
      grade: 1,
      typeMode: 'auto',
      countPerKnowledgePoint: 3,
    });
    const oneTarget = selectGenerationTargets({
      grade: 1,
      semester: '上',
      kpId: '1-1',
      typeMode: 'choice',
      countPerKnowledgePoint: 3,
    });
    expect(allGradeOne.length).toBeGreaterThan(1);
    expect(oneTarget).toEqual([target]);
    expect(buildGenerationPrompt(target, 'choice', 3)).toContain('全部为四选一选择题');
    expect(buildQualityPrompt([generatedQuestion('1-1-90')])).toContain('逐题质检以下 1 道题');
  });

  it('explains that answer values do not repeat surrounding units', () => {
    const prompt = buildQualityPrompt([
      generatedQuestion('6-10-07', {
        question: '把 1/6 化成百分数约是 ____%。',
        blanks: ['16.7'],
      }),
    ]);

    expect(prompt).toContain('blanks 只表示学生需要在 ____ 内输入的内容');
    expect(prompt).toContain('“____%”对应 blanks 为“16.7”');
    expect(prompt).toContain('"blanks":["16.7"]');
  });

  it('parses reasoning-wrapped generated questions and assigns server-owned IDs', () => {
    const parsed = parseGeneratedQuestions(
      `<think>先检查字段。</think>\n${JSON.stringify(generationPayload())}`,
      target,
      'auto',
      3,
      { fill_blank: 8, choice: 9, mixed: 10 },
    );
    expect(parsed).toMatchObject([
      { id: '1-1-08', type: 'fill_blank', enable: false },
      { id: '1-1-c09', type: 'choice', correctChoice: 'B', enable: false },
      { id: '1-1-m10', type: 'mixed', blanks: ['2'], enable: false },
    ]);
    expect(parsed.every(question => question.checkMessage === 'AI 生成，等待质检')).toBe(true);
  });

  it('rejects incomplete generated batches and malformed quality decisions', () => {
    expect(() =>
      parseGeneratedQuestions(JSON.stringify(generationPayload().slice(0, 2)), target, 'auto', 3, {
        fill_blank: 1,
        choice: 1,
        mixed: 1,
      }),
    ).toThrow('requested number');
    expect(() => parseQualityDecisions('not json', ['q-1'])).toThrow('valid JSON array');
    expect(() =>
      parseQualityDecisions(JSON.stringify([{ id: 'q-1', status: 'error' }]), ['q-1']),
    ).toThrow('missing a reason');
    expect(() =>
      parseQualityDecisions(JSON.stringify([{ id: 'q-1', status: 'ok' }]), ['q-1', 'q-2']),
    ).toThrow('does not cover every question');
  });

  it('preserves expected order when parsing complete quality decisions', () => {
    expect(
      parseQualityDecisions(
        `<think>checked</think>${JSON.stringify([
          { id: 'q-2', status: 'error', reason: '答案错误' },
          { id: 'q-1', status: 'ok' },
        ])}`,
        ['q-1', 'q-2'],
      ),
    ).toEqual([
      { id: 'q-1', status: 'ok' },
      { id: 'q-2', status: 'error', reason: '答案错误' },
    ]);
  });
});

describe('question task persistence and AI execution', () => {
  it('persists durable task progress, events, completion, and active-task conflicts', async () => {
    await createGenerationTask();
    await expect(createGenerationTask('task-2')).rejects.toThrow('已有题库任务正在运行');
    await markQuestionTaskRunning(testEnv.CONTENT_DB, 'task-1', '正在生成', 2, NOW);
    await updateQuestionTaskProgress(testEnv.CONTENT_DB, {
      taskId: 'task-1',
      eventKey: 'batch-1',
      stage: '完成第一批',
      current: 1,
      total: 2,
      stats: { inserted: 3 },
      level: 'success',
      message: '第一批已写入',
      now: LATER,
    });
    await updateQuestionTaskProgress(testEnv.CONTENT_DB, {
      taskId: 'task-1',
      eventKey: 'batch-1',
      stage: '完成第一批',
      current: 1,
      total: 2,
      stats: { inserted: 3 },
      message: '重复事件不会重复写入',
      now: LATER,
    });
    await completeQuestionTask(testEnv.CONTENT_DB, 'task-1', '生成完成', { inserted: 6 }, LATER);

    await expect(listQuestionTasks(testEnv.CONTENT_DB, 10)).resolves.toMatchObject([
      { id: 'task-1', status: 'completed', progressCurrent: 2, stats: { inserted: 6 } },
    ]);
    const detail = await getQuestionTask(testEnv.CONTENT_DB, 'task-1');
    expect(detail.events?.filter(event => event.message.includes('第一批'))).toHaveLength(1);
    await expect(getQuestionTask(testEnv.CONTENT_DB, 'missing')).rejects.toThrow('题库任务不存在');
  });

  it('records failed and cancelled terminal states', async () => {
    await createGenerationTask('failed-task');
    await failQuestionTask(testEnv.CONTENT_DB, 'failed-task', ' provider\nfailed ', LATER);
    await createGenerationTask('cancelled-task');
    await cancelQuestionTask(testEnv.CONTENT_DB, 'cancelled-task', LATER);
    await expect(getQuestionTask(testEnv.CONTENT_DB, 'failed-task')).resolves.toMatchObject({
      status: 'failed',
      errorMessage: 'provider failed',
    });
    await expect(getQuestionTask(testEnv.CONTENT_DB, 'cancelled-task')).resolves.toMatchObject({
      status: 'cancelled',
      stage: '管理员已停止',
      errorMessage: null,
    });
  });

  it('writes generated questions idempotently and applies quality results atomically', async () => {
    await createGenerationTask();
    const questions = [generatedQuestion('1-1-90'), generatedQuestion('1-1-91')];
    const inserted = await insertGeneratedQuestionBatch(
      testEnv.CONTENT_DB,
      'task-1',
      'generate-1',
      questions,
      NOW,
    );
    expect(inserted).toEqual({ inserted: 2, questionIds: ['1-1-90', '1-1-91'] });
    await expect(
      insertGeneratedQuestionBatch(testEnv.CONTENT_DB, 'task-1', 'generate-1', questions, NOW),
    ).resolves.toEqual(inserted);
    const qualityIds = await prepareQualityQuestionIds(testEnv.CONTENT_DB, {
      scope: 'disabled',
      grade: 1,
      semester: '上',
      type: 'fill_blank',
      limit: 'all',
    });
    expect(qualityIds).toEqual(['1-1-90', '1-1-91']);
    await expect(loadQualityQuestionBatch(testEnv.CONTENT_DB, qualityIds)).resolves.toMatchObject([
      { id: '1-1-90' },
      { id: '1-1-91' },
    ]);

    const reviewed = await applyQualityQuestionBatch(
      testEnv.CONTENT_DB,
      'task-1',
      'quality-1',
      [
        { id: '1-1-90', status: 'ok' },
        { id: '1-1-91', status: 'error', reason: '答案不唯一' },
      ],
      LATER,
    );
    expect(reviewed).toEqual({
      checked: 2,
      passed: 1,
      failed: 1,
      questionIds: ['1-1-90', '1-1-91'],
    });
    await expect(
      applyQualityQuestionBatch(
        testEnv.CONTENT_DB,
        'task-1',
        'quality-1',
        [{ id: 'missing', status: 'ok' }],
        LATER,
      ),
    ).resolves.toEqual(reviewed);
    await expect(
      testEnv.CONTENT_DB.prepare(
        `SELECT id, enable, check_message, published_revision
         FROM published_questions ORDER BY id`,
      ).all(),
    ).resolves.toMatchObject({
      results: [
        { id: '1-1-90', enable: 1, check_message: null, published_revision: 2 },
        { id: '1-1-91', enable: 0, check_message: '答案不唯一', published_revision: 2 },
      ],
    });
    await applyQualityQuestionBatch(
      testEnv.CONTENT_DB,
      'task-1',
      'quality-2',
      [{ id: '1-1-91', status: 'ok' }],
      '2026-07-19T00:02:00.000Z',
    );
    await expect(
      testEnv.CONTENT_DB.prepare(
        `SELECT enable, check_message FROM questions WHERE id = '1-1-91'`,
      ).first(),
    ).resolves.toEqual({ enable: 0, check_message: '答案不唯一' });
  });

  it('calls the configured AI provider with bounded completion output', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: JSON.stringify(generationPayload()) } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: '[{"id":"1-1-01","status":"ok"}]' } }] }),
      );
    vi.stubGlobal('fetch', fetcher);
    const bindings = {
      ...testEnv,
      BASE_URL: 'https://api.minimaxi.com/v1',
      API_KEY: 'test-key',
      MODEL: 'MiniMax-M2.7',
      AI_PROTOCOL: 'openai-chat',
    } as CloudflareBindings;

    const generated = await generateQuestionsForTarget(bindings, target, {
      grade: 1,
      kpId: '1-1',
      typeMode: 'auto',
      countPerKnowledgePoint: 3,
    });
    expect(generated).toHaveLength(3);
    await expect(requestQualityDecisions(bindings, [generatedQuestion('1-1-01')])).resolves.toEqual(
      [{ id: '1-1-01', status: 'ok' }],
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).max_completion_tokens).toBe(8192);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)).max_completion_tokens).toBe(4096);
  });
});
