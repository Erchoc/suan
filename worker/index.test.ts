import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './index';

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';

const allowRateLimiter: RateLimit = {
  limit: async () => ({ success: true }),
};

function createEnv(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return {
    AI_API_KEY: 'test-api-key',
    AI_BASE_URL: 'https://api.deepseek.com',
    AI_MODEL: 'deepseek-chat',
    AI_RATE_LIMITER: allowRateLimiter,
    ...overrides,
  };
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

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Suan Hono Worker', () => {
  it('提供可观测的健康检查', async () => {
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

  it('未知 API 返回结构化 404，而不是 SPA HTML', async () => {
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

  it('拒绝跨站浏览器请求', async () => {
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

  it('拒绝 system 消息和非法 JSON 类型', async () => {
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

  it('限制请求体大小', async () => {
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

  it('限流时返回 429 与 Retry-After', async () => {
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

  it('在 Cloudflare 边缘优先按连接 IP 限流', async () => {
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
      createEnv({ AI_API_KEY: '', AI_RATE_LIMITER: rateLimiter }),
    );

    expect(response.status).toBe(503);
    expect(receivedKey).toBe('ai:ip:203.0.113.9');
  });

  it('未配置密钥时返回 503', async () => {
    const response = await createApp({ randomUUID: () => CLIENT_ID }).request(
      '/api/ai/chat',
      chatRequest(),
      createEnv({ AI_API_KEY: '' }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_NOT_CONFIGURED' },
    });
  });

  it('服务端构造 system prompt 并原样流式返回上游 SSE', async () => {
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

    const response = await app.request('/api/ai/chat', chatRequest(), createEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain('"content":"2"');
    expect(upstreamUrl).toBe('https://api.deepseek.com/chat/completions');
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

  it('默认上游 fetch 使用 Worker 全局对象作为 receiver', async () => {
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

  it('隐藏上游错误正文并返回 502', async () => {
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
