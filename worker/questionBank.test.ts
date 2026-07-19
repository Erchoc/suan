import { applyD1Migrations, type D1Migration, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  batchSetQuestionStatus,
  dismissOpenQuestionReports,
  getQuestionBankMeta,
  isMissingQuestionBankSchema,
  listAdminQuestions,
  listOpenQuestionReports,
  listPublishedQuestions,
  parseQuestionPatch,
  QuestionBankError,
  submitQuestionReport,
  updateQuestion,
} from './questionBank';

const NOW = '2026-07-19T00:00:00.000Z';
const testEnv = env as CloudflareBindings & { TEST_MIGRATIONS: D1Migration[] };

async function insertQuestion(
  id = 'question-1',
  overrides: {
    enable?: boolean;
    checkMessage?: string | null;
    type?: 'fill_blank' | 'choice' | 'mixed';
    blanksJson?: string;
    blankTypesJson?: string | null;
    choicesJson?: string | null;
    correctChoice?: string | null;
  } = {},
): Promise<void> {
  const enable = overrides.enable ?? true;
  await testEnv.CONTENT_DB.prepare(
    `INSERT INTO questions
      (id, kp_id, kp_name, grade, semester, difficulty, type, question, blanks_json,
       blank_types_json, choices_json, correct_choice, solution, common_mistake, hint,
       enable, check_message, created_at, updated_at)
     VALUES (?, 'kp-1', 'Addition', 'Grade 1', 'First semester', 'easy', ?,
       'What is 1 + 1?', ?, ?, ?, ?, 'Add the numbers.', 'Skipping an addend.',
       'Count one more.', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      overrides.type ?? 'fill_blank',
      overrides.blanksJson ?? '["2"]',
      overrides.blankTypesJson === undefined ? '["number"]' : overrides.blankTypesJson,
      overrides.choicesJson ?? null,
      overrides.correctChoice ?? null,
      enable ? 1 : 0,
      overrides.checkMessage ?? null,
      NOW,
      NOW,
    )
    .run();
}

async function setMeta(draftRevision: number, publishedRevision: number): Promise<void> {
  await testEnv.CONTENT_DB.prepare(
    `UPDATE question_bank_meta SET draft_revision = ?, published_revision = ?,
      source_sha256 = 'test-source', imported_at = ?, published_at = ?, updated_at = ?
     WHERE singleton_id = 1`,
  )
    .bind(draftRevision, publishedRevision, NOW, publishedRevision > 0 ? NOW : null, NOW)
    .run();
}

async function publishCurrentQuestion(questionId: string, revision = 1): Promise<void> {
  await testEnv.CONTENT_DB.batch([
    testEnv.CONTENT_DB.prepare(
      `INSERT INTO published_questions
        (id, kp_id, kp_name, grade, semester, difficulty, type, question, blanks_json,
         blank_types_json, choices_json, correct_choice, solution, common_mistake, hint,
         enable, check_message, published_revision, published_at)
       SELECT id, kp_id, kp_name, grade, semester, difficulty, type, question, blanks_json,
        blank_types_json, choices_json, correct_choice, solution, common_mistake, hint,
        enable, check_message, ?, ? FROM questions WHERE id = ?`,
    ).bind(revision, NOW, questionId),
    testEnv.CONTENT_DB.prepare(
      `INSERT INTO published_question_versions
        (revision, id, kp_id, kp_name, grade, semester, difficulty, type, question,
         blanks_json, blank_types_json, choices_json, correct_choice, solution,
         common_mistake, hint, enable, check_message, published_at)
       SELECT ?, id, kp_id, kp_name, grade, semester, difficulty, type, question,
        blanks_json, blank_types_json, choices_json, correct_choice, solution,
        common_mistake, hint, enable, check_message, ? FROM questions WHERE id = ?`,
    ).bind(revision, NOW, questionId),
  ]);
  await setMeta(revision, revision);
}

beforeEach(async () => {
  await applyD1Migrations(testEnv.CONTENT_DB, testEnv.TEST_MIGRATIONS);
  await testEnv.CONTENT_DB.batch([
    testEnv.CONTENT_DB.prepare('DELETE FROM question_audit_logs'),
    testEnv.CONTENT_DB.prepare('DELETE FROM question_reports'),
    testEnv.CONTENT_DB.prepare('DELETE FROM question_bank_releases'),
    testEnv.CONTENT_DB.prepare('DELETE FROM published_question_versions'),
    testEnv.CONTENT_DB.prepare('DELETE FROM published_questions'),
    testEnv.CONTENT_DB.prepare('DELETE FROM questions'),
    testEnv.CONTENT_DB.prepare(
      `INSERT OR IGNORE INTO question_bank_meta (singleton_id) VALUES (1)`,
    ),
    testEnv.CONTENT_DB.prepare(
      `UPDATE question_bank_meta SET draft_revision = 0, published_revision = 0,
        source_sha256 = NULL, imported_at = NULL, published_at = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE singleton_id = 1`,
    ),
  ]);
});

describe('question patch validation', () => {
  it('normalizes every supported editable field', () => {
    expect(
      parseQuestionPatch({
        kp_id: ' kp-2 ',
        kp_name: ' Subtraction ',
        grade: ' Grade 2 ',
        semester: ' Second semester ',
        difficulty: 'hard',
        type: 'mixed',
        question: ' Choose and fill. ',
        blanks: [' 3 '],
        blank_types: ['number'],
        choices: [{ label: ' A ', content: ' Three ' }],
        correctChoice: ' A ',
        solution: ' Explain it. ',
        common_mistake: ' Guessing. ',
        hint: ' Count backwards. ',
        enable: false,
        checkMessage: ' Needs review. ',
      }),
    ).toEqual({
      kp_id: 'kp-2',
      kp_name: 'Subtraction',
      grade: 'Grade 2',
      semester: 'Second semester',
      difficulty: 'hard',
      type: 'mixed',
      question: 'Choose and fill.',
      blanks: ['3'],
      blank_types: ['number'],
      choices: [{ label: 'A', content: 'Three' }],
      correctChoice: 'A',
      solution: 'Explain it.',
      common_mistake: 'Guessing.',
      hint: 'Count backwards.',
      enable: false,
      checkMessage: 'Needs review.',
    });

    expect(
      parseQuestionPatch({
        blank_types: null,
        choices: null,
        correctChoice: '',
        checkMessage: null,
      }),
    ).toEqual({
      blank_types: null,
      choices: null,
      correctChoice: null,
      checkMessage: null,
    });
  });

  it.each([
    [null, '请求体必须是对象'],
    [[], '请求体必须是对象'],
    [{ unsupported: true }, '不支持字段 unsupported'],
    [{}, '没有可更新字段'],
    [{ kp_id: 1 }, 'kp_id 必须是字符串'],
    [{ kp_id: ' ' }, 'kp_id 长度不合法'],
    [{ kp_id: 'x'.repeat(41) }, 'kp_id 长度不合法'],
    [{ difficulty: 'impossible' }, 'difficulty 不合法'],
    [{ type: 'essay' }, 'type 不合法'],
    [{ blanks: '2' }, 'blanks 格式不合法'],
    [{ blanks: Array.from({ length: 21 }, () => '2') }, 'blanks 格式不合法'],
    [{ blanks: [''] }, 'blanks[0] 格式不合法'],
    [{ blanks: ['x'.repeat(501)] }, 'blanks[0] 格式不合法'],
    [{ blank_types: ['unsupported'] }, 'blank_types 包含不支持的类型'],
    [{ choices: 'A' }, 'choices 格式不合法'],
    [
      { choices: Array.from({ length: 11 }, () => ({ label: 'A', content: '1' })) },
      'choices 格式不合法',
    ],
    [{ choices: ['A'] }, 'choices[0] 格式不合法'],
    [{ choices: [{ label: '', content: '1' }] }, 'label 长度不合法'],
    [{ correctChoice: 1 }, 'correctChoice 必须是字符串'],
    [{ enable: 'yes' }, 'enable 必须是布尔值'],
    [{ checkMessage: 1 }, 'checkMessage 必须是字符串'],
  ])('rejects malformed patch %#', (input, message) => {
    expect(() => parseQuestionPatch(input)).toThrow(message);
  });
});

describe('question bank service edge cases', () => {
  it('rejects invalid merged question states and supports clearing optional fields', async () => {
    await insertQuestion();

    await expect(
      updateQuestion(testEnv.CONTENT_DB, 'question-1', { blank_types: ['number', 'text'] }, NOW),
    ).rejects.toThrow('blank_types 必须与 blanks 一一对应');
    await expect(
      updateQuestion(testEnv.CONTENT_DB, 'question-1', { blanks: [], blank_types: null }, NOW),
    ).rejects.toThrow('填空题至少需要一个答案');
    await expect(
      updateQuestion(testEnv.CONTENT_DB, 'question-1', { type: 'choice' }, NOW),
    ).rejects.toThrow('选择题需要选项和正确选项');
    await expect(
      updateQuestion(
        testEnv.CONTENT_DB,
        'question-1',
        {
          type: 'choice',
          choices: [{ label: 'A', content: '2' }],
          correctChoice: 'B',
        },
        NOW,
      ),
    ).rejects.toThrow('正确选项必须存在于 choices 中');
    await expect(
      updateQuestion(
        testEnv.CONTENT_DB,
        'question-1',
        {
          type: 'mixed',
          blanks: [],
          blank_types: null,
          choices: [{ label: 'A', content: '2' }],
          correctChoice: 'A',
        },
        NOW,
      ),
    ).rejects.toThrow('综合题至少需要一个填空答案');
    await expect(
      updateQuestion(testEnv.CONTENT_DB, 'question-1', { enable: false }, NOW),
    ).rejects.toThrow('禁用题目时必须填写质量原因');

    const cleared = await updateQuestion(
      testEnv.CONTENT_DB,
      'question-1',
      { blank_types: null, choices: null, correctChoice: null, checkMessage: null },
      NOW,
    );
    expect(cleared.question.blank_types).toBeUndefined();
    expect(cleared.question.choices).toBeUndefined();
  });

  it('clears a quality reason when a question is enabled again', async () => {
    await insertQuestion('disabled', { enable: false, checkMessage: 'Needs review' });

    const updated = await updateQuestion(testEnv.CONTENT_DB, 'disabled', { enable: true }, NOW);

    expect(updated.question).toMatchObject({ enable: true });
    expect(updated.question.checkMessage).toBeUndefined();
  });

  it('applies every admin filter and returns rich optional question data', async () => {
    await insertQuestion('choice', {
      type: 'choice',
      blanksJson: '[]',
      blankTypesJson: null,
      choicesJson: '[{"label":"A","content":"2"}]',
      correctChoice: 'A',
    });
    await insertQuestion('disabled', { enable: false, checkMessage: 'Duplicate' });

    const result = await listAdminQuestions(testEnv.CONTENT_DB, {
      page: 1,
      pageSize: 10,
      query: 'choice',
      grade: 'Grade 1',
      semester: 'First semester',
      difficulty: 'easy',
      type: 'choice',
      status: 'enabled',
    });

    expect(result).toMatchObject({
      total: 1,
      stats: { total: 2, enabled: 1, disabled: 1 },
      data: [{ id: 'choice', choices: [{ label: 'A', content: '2' }], correctChoice: 'A' }],
    });
  });

  it('stores versioned reports and resolves them when a fix is automatically synchronized', async () => {
    await insertQuestion('reported-question');
    await publishCurrentQuestion('reported-question');

    const first = await submitQuestionReport(
      testEnv.CONTENT_DB,
      {
        questionId: 'reported-question',
        publishedRevision: 1,
        reason: 'The answer looks incorrect.',
        source: 'exam',
        sessionId: '00000000-0000-4000-8000-000000000001',
      },
      'report-1',
      NOW,
    );
    const repeated = await submitQuestionReport(
      testEnv.CONTENT_DB,
      {
        questionId: 'reported-question',
        publishedRevision: 1,
        reason: 'The wording and answer both look incorrect.',
        source: 'exam',
        sessionId: '00000000-0000-4000-8000-000000000001',
      },
      'report-2',
      '2026-07-19T00:01:00.000Z',
    );
    expect(first).toEqual({ id: 'report-1', status: 'open' });
    expect(repeated).toEqual({ id: 'report-1', status: 'open' });

    const attention = await listAdminQuestions(testEnv.CONTENT_DB, {
      page: 1,
      pageSize: 10,
      attention: 'reported',
    });
    expect(attention).toMatchObject({
      total: 1,
      stats: { reported: 1 },
      data: [
        {
          id: 'reported-question',
          reportSummary: {
            openCount: 1,
            latestReason: 'The wording and answer both look incorrect.',
          },
        },
      ],
    });
    await expect(
      listOpenQuestionReports(testEnv.CONTENT_DB, 'reported-question', 10),
    ).resolves.toMatchObject([
      {
        id: 'report-1',
        publishedRevision: 1,
        questionSnapshot: { question: 'What is 1 + 1?' },
      },
    ]);

    await updateQuestion(
      testEnv.CONTENT_DB,
      'reported-question',
      { question: 'What is 1 plus 1? ____' },
      '2026-07-19T00:02:00.000Z',
    );
    expect(
      (await listOpenQuestionReports(testEnv.CONTENT_DB, 'reported-question', 10)).length,
    ).toBe(0);
    await expect(
      testEnv.CONTENT_DB.prepare(
        `SELECT revision, question FROM published_question_versions
         WHERE id = ? ORDER BY revision`,
      )
        .bind('reported-question')
        .all(),
    ).resolves.toMatchObject({
      results: [
        { revision: 1, question: 'What is 1 + 1?' },
        { revision: 2, question: 'What is 1 plus 1? ____' },
      ],
    });
  });

  it('dismisses false reports with an audit record and rejects invalid report input', async () => {
    await insertQuestion('dismissed-question');
    await publishCurrentQuestion('dismissed-question');

    await expect(
      submitQuestionReport(
        testEnv.CONTENT_DB,
        {
          questionId: 'dismissed-question',
          publishedRevision: 2,
          reason: 'Invalid future version',
          source: 'review',
          sessionId: 'session-1',
        },
        'invalid-report',
        NOW,
      ),
    ).rejects.toThrow('题库版本不合法');
    await expect(
      submitQuestionReport(
        testEnv.CONTENT_DB,
        {
          questionId: 'dismissed-question',
          publishedRevision: 1,
          reason: '',
          source: 'review',
          sessionId: 'session-1',
        },
        'invalid-report',
        NOW,
      ),
    ).rejects.toThrow('反馈原因长度不合法');

    await submitQuestionReport(
      testEnv.CONTENT_DB,
      {
        questionId: 'dismissed-question',
        publishedRevision: 1,
        reason: 'I misread the question.',
        source: 'review',
        sessionId: 'session-1',
      },
      'report-1',
      NOW,
    );
    await expect(
      dismissOpenQuestionReports(testEnv.CONTENT_DB, 'dismissed-question', '', NOW),
    ).rejects.toThrow('处理说明长度不合法');
    await expect(
      dismissOpenQuestionReports(
        testEnv.CONTENT_DB,
        'dismissed-question',
        'Confirmed as a misunderstanding.',
        NOW,
      ),
    ).resolves.toBe(1);
    await expect(
      testEnv.CONTENT_DB.prepare(
        `SELECT action, question_id FROM question_audit_logs ORDER BY id DESC LIMIT 1`,
      ).first(),
    ).resolves.toEqual({ action: 'dismiss_reports', question_id: 'dismissed-question' });
  });

  it('rejects missing rows and malformed stored JSON', async () => {
    await expect(
      updateQuestion(testEnv.CONTENT_DB, 'missing', { question: 'Updated' }, NOW),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await insertQuestion('corrupt', { blanksJson: '{bad-json}' });
    await testEnv.CONTENT_DB.prepare(
      `INSERT INTO published_questions
        (id, kp_id, kp_name, grade, semester, difficulty, type, question, blanks_json,
         blank_types_json, choices_json, correct_choice, solution, common_mistake, hint,
         enable, check_message, published_revision, published_at)
       SELECT id, kp_id, kp_name, grade, semester, difficulty, type, question, blanks_json,
         blank_types_json, choices_json, correct_choice, solution, common_mistake, hint,
         enable, check_message, 1, ? FROM questions WHERE id = 'corrupt'`,
    )
      .bind(NOW)
      .run();
    await setMeta(1, 1);

    await expect(listPublishedQuestions(testEnv.CONTENT_DB)).rejects.toMatchObject({
      code: 'NOT_READY',
      message: '题库数据格式损坏',
    });
  });

  it('validates batch bounds, reasons, missing IDs, and enable operations', async () => {
    await insertQuestion('disabled', { enable: false, checkMessage: 'Needs review' });

    await expect(
      batchSetQuestionStatus(testEnv.CONTENT_DB, [], true, undefined, NOW),
    ).rejects.toThrow('ids 必须包含 1 到 100 道题');
    await expect(
      batchSetQuestionStatus(
        testEnv.CONTENT_DB,
        Array.from({ length: 101 }, (_, index) => `q-${index}`),
        true,
        undefined,
        NOW,
      ),
    ).rejects.toThrow('ids 必须包含 1 到 100 道题');
    await expect(
      batchSetQuestionStatus(testEnv.CONTENT_DB, ['disabled'], false, 'x'.repeat(1_001), NOW),
    ).rejects.toThrow('批量禁用时必须填写质量原因');
    await expect(
      batchSetQuestionStatus(testEnv.CONTENT_DB, ['missing'], true, undefined, NOW),
    ).rejects.toThrow('部分题目不存在');

    const meta = await batchSetQuestionStatus(
      testEnv.CONTENT_DB,
      ['disabled', 'disabled'],
      true,
      undefined,
      NOW,
    );
    expect(meta.draftRevision).toBe(1);
    expect(meta.publishedRevision).toBe(1);
    await expect(
      testEnv.CONTENT_DB.prepare('SELECT enable, check_message FROM questions WHERE id = ?')
        .bind('disabled')
        .first(),
    ).resolves.toEqual({ enable: 1, check_message: null });
    await expect(
      testEnv.CONTENT_DB.prepare(
        `SELECT enable, published_revision FROM published_questions WHERE id = ?`,
      )
        .bind('disabled')
        .first(),
    ).resolves.toEqual({ enable: 1, published_revision: 1 });
  });

  it('handles missing metadata and schema error detection', async () => {
    expect(isMissingQuestionBankSchema(new Error('no such table: questions'))).toBe(true);
    expect(isMissingQuestionBankSchema(new Error('other error'))).toBe(false);
    expect(isMissingQuestionBankSchema('no such table')).toBe(false);

    await testEnv.CONTENT_DB.prepare('DELETE FROM question_bank_meta').run();
    await expect(getQuestionBankMeta(testEnv.CONTENT_DB)).rejects.toEqual(
      new QuestionBankError('NOT_READY', '题库数据库尚未初始化'),
    );
  });
});
