import { applyD1Migrations, type D1Migration, env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './index';

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-07-19T00:00:00.000Z');

const allowRateLimiter: RateLimit = {
  limit: async () => ({ success: true }),
};

const testEnv = env as CloudflareBindings & { TEST_MIGRATIONS: D1Migration[] };

function createEnv(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return {
    API_KEY: 'test-api-key',
    BASE_URL: 'https://api.deepseek.com',
    MODEL: 'deepseek-chat',
    AI_PROTOCOL: 'openai-chat',
    ADMIN_SESSION_SECRET: 'test-admin-session-secret-that-is-long-enough',
    CONTENT_DB: testEnv.CONTENT_DB,
    AI_RATE_LIMITER: allowRateLimiter,
    ADMIN_RATE_LIMITER: allowRateLimiter,
    REPORT_RATE_LIMITER: allowRateLimiter,
    ...overrides,
  };
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

function chatBody(overrides: Record<string, unknown> = {}) {
  return {
    kpId: '1-1',
    kpName: '数一数',
    gradeNum: 1,
    explanation: '认识数字与数量的关系',
    messages: [{ role: 'user', content: '1 加 1 等于几？' }],
    ...overrides,
  };
}

function chatRequest(body: unknown = chatBody(), headers: HeadersInit = {}): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-suan-client-id': CLIENT_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

async function seedQuestionBank(id = '1-1-01'): Promise<void> {
  const now = '2026-07-19T00:00:00.000Z';
  await testEnv.CONTENT_DB.batch([
    testEnv.CONTENT_DB.prepare(
      `INSERT INTO questions
          (id, kp_id, kp_name, grade, semester, difficulty, type, question, blanks_json,
           blank_types_json, choices_json, correct_choice, solution, common_mistake, hint,
           enable, check_message, created_at, updated_at)
         VALUES (?, '1-1', 'Counting', 'Grade 1', 'First semester', 'easy', 'fill_blank',
           'What is 1 + 1? ____', '["2"]', '["number"]', NULL, NULL, 'Add the numbers.',
           'Skipping one addend.', 'Count one more.', 1, NULL, ?, ?)`,
    ).bind(id, now, now),
    testEnv.CONTENT_DB.prepare(
      `INSERT INTO published_questions
          (id, kp_id, kp_name, grade, semester, difficulty, type, question, blanks_json,
           blank_types_json, choices_json, correct_choice, solution, common_mistake, hint,
           enable, check_message, published_revision, published_at)
         VALUES (?, '1-1', 'Counting', 'Grade 1', 'First semester', 'easy', 'fill_blank',
           'What is 1 + 1? ____', '["2"]', '["number"]', NULL, NULL, 'Add the numbers.',
           'Skipping one addend.', 'Count one more.', 1, NULL, 1, ?)`,
    ).bind(id, now),
    testEnv.CONTENT_DB.prepare(
      `INSERT INTO published_question_versions
          (revision, id, kp_id, kp_name, grade, semester, difficulty, type, question,
           blanks_json, blank_types_json, choices_json, correct_choice, solution,
           common_mistake, hint, enable, check_message, published_at)
         VALUES (1, ?, '1-1', 'Counting', 'Grade 1', 'First semester', 'easy', 'fill_blank',
           'What is 1 + 1? ____', '["2"]', '["number"]', NULL, NULL, 'Add the numbers.',
           'Skipping one addend.', 'Count one more.', 1, NULL, ?)`,
    ).bind(id, now),
    testEnv.CONTENT_DB.prepare(
      `UPDATE question_bank_meta SET draft_revision = 1, published_revision = 1,
          source_sha256 = 'test-source', imported_at = ?, published_at = ?, updated_at = ?
         WHERE singleton_id = 1`,
    ).bind(now, now, now),
  ]);
}

function adminSessionRequest(passcode: string, headers: HeadersInit = {}): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-suan-client-id': CLIENT_ID,
      ...headers,
    },
    body: JSON.stringify({ pw: passcode }),
  };
}

async function loginAdmin(app: ReturnType<typeof createApp>, bindings = createEnv()) {
  const response = await app.request('/api/admin/session', adminSessionRequest('0719'), bindings);
  expect(response.status).toBe(200);
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toContain('HttpOnly');
  return setCookie?.split(';')[0] ?? '';
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
      `UPDATE question_bank_meta SET draft_revision = 0, published_revision = 0,
       source_sha256 = NULL, imported_at = NULL, published_at = NULL,
       updated_at = CURRENT_TIMESTAMP WHERE singleton_id = 1`,
    ),
  ]);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Suan Hono Worker', () => {
  it('provides an observable health check', async () => {
    const app = createApp({ randomUUID: () => CLIENT_ID });
    const response = await app.request('/api/health', {}, createEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('x-trace-id')).toBe(CLIENT_ID);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'suan',
      ai: 'ready',
    });
  });

  it('returns a structured 404 instead of SPA HTML for an unknown API route', async () => {
    const response = await createApp({ randomUUID: () => CLIENT_ID }).request(
      '/api/missing',
      {},
      createEnv(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: '接口不存在' },
      traceId: CLIENT_ID,
    });
  });

  it('reports an uninitialized question bank with a structured fallback signal', async () => {
    const response = await createApp({ randomUUID: () => CLIENT_ID }).request(
      '/api/questions',
      {},
      createEnv(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'QUESTION_BANK_NOT_READY' },
    });
  });

  it('serves published questions with versioned caching and single-question lookup', async () => {
    await seedQuestionBank();
    const app = createApp({ randomUUID: () => CLIENT_ID });
    const response = await app.request('/api/questions', {}, createEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('W/"questions-1"');
    expect(response.headers.get('cache-control')).toContain('max-age=300');
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      version: 1,
      source: 'd1',
      data: [{ id: '1-1-01', enable: true, type: 'fill_blank' }],
    });

    const cached = await app.request(
      '/api/questions',
      { headers: { 'if-none-match': 'W/"questions-1"' } },
      createEnv(),
    );
    expect(cached.status).toBe(304);

    const single = await app.request('/api/questions/1-1-01', {}, createEnv());
    expect(single.status).toBe(200);
    await expect(single.json()).resolves.toMatchObject({ data: { id: '1-1-01' }, version: 1 });
  });

  it('accepts versioned question reports and exposes the admin handling flow', async () => {
    await seedQuestionBank();
    const app = createApp({ now: () => NOW, randomUUID: () => CLIENT_ID });
    const bindings = createEnv();
    const report = await app.request(
      '/api/questions/1-1-01/report',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-suan-client-id': CLIENT_ID },
        body: JSON.stringify({
          reason: '答案看起来不正确',
          source: 'exam',
          sessionId: CLIENT_ID,
          publishedRevision: 1,
        }),
      },
      bindings,
    );
    expect(report.status).toBe(201);
    await expect(report.json()).resolves.toEqual({
      data: { id: CLIENT_ID, status: 'open' },
    });

    const cookie = await loginAdmin(app, bindings);
    const list = await app.request(
      '/api/admin/questions?page=1&pageSize=20&attention=reported',
      { headers: { cookie } },
      bindings,
    );
    await expect(list.json()).resolves.toMatchObject({
      total: 1,
      stats: { reported: 1 },
      data: [{ id: '1-1-01', reportSummary: { openCount: 1 } }],
    });

    const reports = await app.request(
      '/api/admin/question-reports?questionId=1-1-01',
      { headers: { cookie } },
      bindings,
    );
    await expect(reports.json()).resolves.toMatchObject({
      data: [{ reason: '答案看起来不正确', questionSnapshot: { id: '1-1-01' } }],
    });

    const dismissed = await app.request(
      '/api/admin/question-reports/dismiss',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ questionId: '1-1-01', note: '核实后题目无误' }),
      },
      bindings,
    );
    await expect(dismissed.json()).resolves.toEqual({ ok: true, dismissed: 1 });
  });

  it('validates report origin, rate limit, and request fields', async () => {
    await seedQuestionBank();
    const app = createApp({ now: () => NOW, randomUUID: () => CLIENT_ID });
    const crossOrigin = await app.request(
      'https://suan.longye.site/api/questions/1-1-01/report',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({}),
      },
      createEnv(),
    );
    expect(crossOrigin.status).toBe(403);

    const limited = await app.request(
      '/api/questions/1-1-01/report',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-suan-client-id': CLIENT_ID },
        body: JSON.stringify({}),
      },
      createEnv({ REPORT_RATE_LIMITER: { limit: async () => ({ success: false }) } }),
    );
    expect(limited.status).toBe(429);

    const invalid = await app.request(
      '/api/questions/1-1-01/report',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-suan-client-id': CLIENT_ID },
        body: JSON.stringify({
          reason: '错误',
          source: 'preview',
          sessionId: 'not-a-session',
          publishedRevision: 1,
        }),
      },
      createEnv(),
    );
    expect(invalid.status).toBe(400);
  });

  it('creates, verifies, and clears a protected admin session', async () => {
    const app = createApp({ now: () => NOW, randomUUID: () => CLIENT_ID });
    const bindings = createEnv();

    const rejected = await app.request('/api/admin/session', adminSessionRequest('0718'), bindings);
    expect(rejected.status).toBe(401);

    const cookie = await loginAdmin(app, bindings);
    const session = await app.request('/api/admin/session', { headers: { cookie } }, bindings);
    await expect(session.json()).resolves.toEqual({ authenticated: true });

    const logout = await app.request(
      '/api/admin/session',
      { method: 'DELETE', headers: { cookie } },
      bindings,
    );
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    await expect(logout.json()).resolves.toEqual({ authenticated: false });
  });

  it('protects admin login with origin checks, configuration checks, and rate limits', async () => {
    const app = createApp({ now: () => NOW, randomUUID: () => CLIENT_ID });
    const crossOrigin = await app.request(
      'https://suan.longye.site/api/admin/session',
      adminSessionRequest('0719', {
        origin: 'https://evil.example',
      }),
      createEnv(),
    );
    expect(crossOrigin.status).toBe(403);

    const unconfigured = await app.request(
      '/api/admin/session',
      adminSessionRequest('0719'),
      createEnv({ ADMIN_SESSION_SECRET: '' }),
    );
    expect(unconfigured.status).toBe(503);

    const rateLimited = await app.request(
      '/api/admin/session',
      adminSessionRequest('0719'),
      createEnv({ ADMIN_RATE_LIMITER: { limit: async () => ({ success: false }) } }),
    );
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get('retry-after')).toBe('60');
  });

  it('keeps edits in draft until an authenticated publish and records audit history', async () => {
    await seedQuestionBank();
    const app = createApp({ now: () => NOW, randomUUID: () => CLIENT_ID });
    const bindings = createEnv();

    const unauthorized = await app.request('/api/admin/questions', {}, bindings);
    expect(unauthorized.status).toBe(401);

    const cookie = await loginAdmin(app, bindings);
    const list = await app.request(
      '/api/admin/questions?page=1&pageSize=20&query=Counting&status=enabled',
      { headers: { cookie } },
      bindings,
    );
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({
      total: 1,
      stats: { total: 1, enabled: 1, disabled: 0 },
      meta: { draftRevision: 1, publishedRevision: 1 },
    });

    const update = await app.request(
      '/api/admin/questions/1-1-01',
      {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          question: 'Updated draft question ____',
          enable: false,
          checkMessage: 'Answer needs review',
        }),
      },
      bindings,
    );
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toMatchObject({
      question: { question: 'Updated draft question ____', enable: false },
      meta: { draftRevision: 2, publishedRevision: 1 },
    });

    const stillPublished = await app.request('/api/questions/1-1-01', {}, bindings);
    expect(stillPublished.status).toBe(200);
    await expect(stillPublished.json()).resolves.toMatchObject({
      data: { question: 'What is 1 + 1? ____', enable: true },
    });

    const stalePublish = await app.request(
      '/api/admin/questions/publish',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ expectedDraftRevision: 1 }),
      },
      bindings,
    );
    expect(stalePublish.status).toBe(409);

    const publish = await app.request(
      '/api/admin/questions/publish',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ expectedDraftRevision: 2 }),
      },
      bindings,
    );
    expect(publish.status).toBe(200);
    await expect(publish.json()).resolves.toMatchObject({
      meta: { draftRevision: 2, publishedRevision: 2 },
      stats: { total: 1, enabled: 0, disabled: 1 },
    });

    const removedFromRuntime = await app.request('/api/questions/1-1-01', {}, bindings);
    expect(removedFromRuntime.status).toBe(404);

    const audit = await app.request(
      '/api/admin/question-audit?limit=10',
      { headers: { cookie } },
      bindings,
    );
    await expect(audit.json()).resolves.toMatchObject({
      data: [{ action: 'publish' }, { action: 'update', questionId: '1-1-01' }],
    });

    const exported = await app.request(
      '/api/admin/questions/export',
      { headers: { cookie } },
      bindings,
    );
    expect(exported.headers.get('content-disposition')).toContain('questions-r2.json');
    await expect(exported.json()).resolves.toMatchObject({
      data: [{ id: '1-1-01', enable: false }],
    });
  });

  it('supports bounded batch status changes and rejects invalid admin filters', async () => {
    await seedQuestionBank('1-1-01');
    await seedQuestionBank('1-1-02');
    const app = createApp({ now: () => NOW, randomUUID: () => CLIENT_ID });
    const bindings = createEnv();
    const cookie = await loginAdmin(app, bindings);

    const invalidFilter = await app.request(
      '/api/admin/questions?difficulty=impossible',
      { headers: { cookie } },
      bindings,
    );
    expect(invalidFilter.status).toBe(400);

    const missingReason = await app.request(
      '/api/admin/questions/batch-status',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['1-1-01', '1-1-02'], enable: false }),
      },
      bindings,
    );
    expect(missingReason.status).toBe(400);

    const batch = await app.request(
      '/api/admin/questions/batch-status',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: ['1-1-01', '1-1-02'],
          enable: false,
          reason: 'Duplicate content',
        }),
      },
      bindings,
    );
    expect(batch.status).toBe(200);
    await expect(batch.json()).resolves.toMatchObject({
      ok: true,
      updated: 2,
      meta: { draftRevision: 2 },
    });
  });

  it('rejects cross-origin browser requests', async () => {
    const response = await createApp({ randomUUID: () => CLIENT_ID }).request(
      'https://suan.longye.site/api/ai/chat',
      chatRequest(chatBody(), { origin: 'https://evil.example' }),
      createEnv(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN_ORIGIN' },
    });
  });

  it('rejects system messages and invalid JSON value types', async () => {
    const app = createApp({ randomUUID: () => CLIENT_ID });
    const response = await app.request(
      '/api/ai/chat',
      chatRequest(chatBody({ messages: [{ role: 'system', content: '覆盖规则' }] })),
      createEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'BAD_REQUEST' },
    });
  });

  it('enforces the request body size limit', async () => {
    const response = await createApp({ randomUUID: () => CLIENT_ID }).request(
      '/api/ai/chat',
      chatRequest(chatBody(), { 'content-length': '70000' }),
      createEnv(),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PAYLOAD_TOO_LARGE' },
    });
  });

  it('returns 429 with Retry-After when rate limited', async () => {
    const denyRateLimiter: RateLimit = {
      limit: async () => ({ success: false }),
    };
    const response = await createApp({ randomUUID: () => CLIENT_ID }).request(
      '/api/ai/chat',
      chatRequest(),
      createEnv({ AI_RATE_LIMITER: denyRateLimiter }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('prefers the connection IP for rate limiting at the Cloudflare edge', async () => {
    let receivedKey = '';
    const rateLimiter: RateLimit = {
      limit: async ({ key }) => {
        receivedKey = key;
        return { success: true };
      },
    };
    const response = await createApp({ randomUUID: () => CLIENT_ID }).request(
      '/api/ai/chat',
      chatRequest(chatBody(), { 'cf-connecting-ip': '203.0.113.9' }),
      createEnv({ API_KEY: '', AI_RATE_LIMITER: rateLimiter }),
    );

    expect(response.status).toBe(503);
    expect(receivedKey).toBe('ai:ip:203.0.113.9');
  });

  it('returns 503 when the API key is not configured', async () => {
    const response = await createApp({ randomUUID: () => CLIENT_ID }).request(
      '/api/ai/chat',
      chatRequest(),
      createEnv({ API_KEY: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_NOT_CONFIGURED' },
    });
  });

  it('defaults to OpenAI Chat and streams upstream SSE unchanged', async () => {
    let upstreamUrl = '';
    let upstreamInit: RequestInit | undefined;
    const upstreamFetch: typeof fetch = async (input, init) => {
      upstreamUrl = String(input);
      upstreamInit = init;
      return new Response('data: {"choices":[{"delta":{"content":"2"}}]}\n\ndata: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      });
    };
    const app = createApp({ fetch: upstreamFetch, randomUUID: () => CLIENT_ID });
    const env = createEnv({ BASE_URL: 'https://api.deepseek.com/v1/chat/completions/' });
    Reflect.deleteProperty(env, 'AI_PROTOCOL');

    const response = await app.request('/api/ai/chat', chatRequest(), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain('"content":"2"');
    expect(upstreamUrl).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(new Headers(upstreamInit?.headers).get('authorization')).toBe('Bearer test-api-key');
    const payload = JSON.parse(String(upstreamInit?.body)) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(payload.model).toBe('deepseek-chat');
    expect(payload.stream).toBe(true);
    expect(payload.messages[0]).toMatchObject({ role: 'system' });
    expect(payload.messages[0].content).toContain('1年级');
    expect(payload.messages[1]).toEqual({ role: 'user', content: '1 加 1 等于几？' });
  });

  it('adapts OpenAI Responses requests and normalizes split text events', async () => {
    let upstreamUrl = '';
    let upstreamInit: RequestInit | undefined;
    const upstreamFetch: typeof fetch = async (input, init) => {
      upstreamUrl = String(input);
      upstreamInit = init;
      return sseResponse([
        'event: response.created\r\ndata: {"type":"response.created"}\r\n\r\nevent: response.output_text.delta\r\ndata: {"type":"response.output_',
        'text.delta","delta":"答"}\r\n\r\nevent: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"案"}\r\n\r\n',
        'event: response.completed\r\ndata: {"type":"response.completed"}\r\n\r\n',
      ]);
    };
    const env = createEnv();
    Reflect.set(env, 'AI_PROTOCOL', 'openai-coding');
    Reflect.set(env, 'BASE_URL', 'https://api.openai.com/v1/v1/chat/completions/');
    Reflect.set(env, 'MODEL', 'gpt-test');

    const response = await createApp({
      fetch: upstreamFetch,
      randomUUID: () => CLIENT_ID,
    }).request('/api/ai/chat', chatRequest(), env);

    expect(response.status).toBe(200);
    expect(upstreamUrl).toBe('https://api.openai.com/v1/responses');
    const headers = new Headers(upstreamInit?.headers);
    expect(headers.get('authorization')).toBe('Bearer test-api-key');
    expect(headers.get('x-api-key')).toBeNull();
    const payload = JSON.parse(String(upstreamInit?.body)) as {
      model: string;
      instructions: string;
      input: Array<{ role: string; content: string }>;
      stream: boolean;
      store: boolean;
    };
    expect(payload).toMatchObject({ model: 'gpt-test', stream: true, store: false });
    expect(payload.instructions).toContain('1年级');
    expect(payload.input).toEqual([{ role: 'user', content: '1 加 1 等于几？' }]);
    expect(await response.text()).toBe(
      'data: {"choices":[{"delta":{"content":"答"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"案"}}]}\n\n' +
        'data: [DONE]\n\n',
    );
  });

  it('adapts Anthropic requests and normalizes only text deltas', async () => {
    let upstreamUrl = '';
    let upstreamInit: RequestInit | undefined;
    const upstreamFetch: typeof fetch = async (input, init) => {
      upstreamUrl = String(input);
      upstreamInit = init;
      return sseResponse([
        'event: ping\ndata: {"type":"ping"}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hidden"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"四"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]);
    };
    const env = createEnv();
    Reflect.set(env, 'AI_PROTOCOL', 'anthropic');
    Reflect.set(env, 'BASE_URL', 'https://api.anthropic.com');
    Reflect.set(env, 'MODEL', 'claude-test');

    const response = await createApp({
      fetch: upstreamFetch,
      randomUUID: () => CLIENT_ID,
    }).request('/api/ai/chat', chatRequest(), env);

    expect(response.status).toBe(200);
    expect(upstreamUrl).toBe('https://api.anthropic.com/v1/messages');
    const headers = new Headers(upstreamInit?.headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-api-key')).toBe('test-api-key');
    expect(headers.get('anthropic-version')).toBe('2023-06-01');
    const payload = JSON.parse(String(upstreamInit?.body)) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
    };
    expect(payload).toMatchObject({ model: 'claude-test', max_tokens: 512, stream: true });
    expect(payload.system).toContain('1年级');
    expect(payload.messages).toEqual([{ role: 'user', content: '1 加 1 等于几？' }]);
    expect(await response.text()).toBe(
      'data: {"choices":[{"delta":{"content":"四"}}]}\n\ndata: [DONE]\n\n',
    );
  });

  it('appends the Anthropic v1 endpoint to a provider-specific base path', async () => {
    let upstreamUrl = '';
    const env = createEnv();
    Reflect.set(env, 'AI_PROTOCOL', 'anthropic');
    Reflect.set(env, 'BASE_URL', 'https://api.deepseek.com/anthropic');

    const response = await createApp({
      fetch: async input => {
        upstreamUrl = String(input);
        return sseResponse(['event: message_stop\ndata: {"type":"message_stop"}\n\n']);
      },
      randomUUID: () => CLIENT_ID,
    }).request('/api/ai/chat', chatRequest(), env);

    expect(response.status).toBe(200);
    expect(upstreamUrl).toBe('https://api.deepseek.com/anthropic/v1/messages');
    expect(await response.text()).toBe('data: [DONE]\n\n');
  });

  it('returns 503 for an unsupported AI protocol before calling upstream', async () => {
    const upstreamFetch = vi.fn<typeof fetch>();
    const env = createEnv();
    Reflect.set(env, 'AI_PROTOCOL', 'unsupported');

    const response = await createApp({
      fetch: upstreamFetch,
      randomUUID: () => CLIENT_ID,
    }).request('/api/ai/chat', chatRequest(), env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_NOT_CONFIGURED', message: 'AI 协议配置无效' },
    });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('surfaces malformed provider events as a stream failure', async () => {
    const env = createEnv();
    Reflect.set(env, 'AI_PROTOCOL', 'openai-coding');
    const response = await createApp({
      fetch: async () => sseResponse(['event: response.output_text.delta\ndata: {not-json}\n\n']),
      randomUUID: () => CLIENT_ID,
    }).request('/api/ai/chat', chatRequest(), env);

    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toThrow('Invalid upstream event stream');
  });

  it('rejects a provider stream that ends before its completion event', async () => {
    const env = createEnv();
    Reflect.set(env, 'AI_PROTOCOL', 'openai-coding');
    const response = await createApp({
      fetch: async () =>
        sseResponse([
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        ]),
      randomUUID: () => CLIENT_ID,
    }).request('/api/ai/chat', chatRequest(), env);

    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    let received = '';
    await expect(
      (async () => {
        if (!reader) return;
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          received += decoder.decode(value, { stream: true });
        }
      })(),
    ).rejects.toThrow('Invalid upstream event stream');
    expect(received).not.toContain('[DONE]');
  });

  it('uses the Worker global object as the receiver for the default upstream fetch', async () => {
    const receiverAwareFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(
        new Response('data: {"choices":[{"delta":{"content":"2"}}]}\n\ndata: [DONE]\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        }),
      );
    });
    vi.stubGlobal('fetch', receiverAwareFetch);
    const app = createApp({ randomUUID: () => CLIENT_ID });

    const response = await app.request('/api/ai/chat', chatRequest(), createEnv());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"content":"2"');
    expect(receiverAwareFetch).toHaveBeenCalledOnce();
  });

  it('hides the upstream error body and returns 502', async () => {
    const upstreamFetch: typeof fetch = async () =>
      new Response('sensitive upstream detail', { status: 401 });
    const response = await createApp({
      fetch: upstreamFetch,
      randomUUID: () => CLIENT_ID,
    }).request('/api/ai/chat', chatRequest(), createEnv());

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain('sensitive upstream detail');
    expect(JSON.parse(text)).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } });
  });
});
