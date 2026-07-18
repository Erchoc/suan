import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './index';

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';

const allowRateLimiter: RateLimit = {
  limit: async () => ({ success: true }),
};

function createEnv(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return {
    API_KEY: 'test-api-key',
    BASE_URL: 'https://api.deepseek.com',
    MODEL: 'deepseek-chat',
    AI_PROTOCOL: 'openai-chat',
    AI_RATE_LIMITER: allowRateLimiter,
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

beforeEach(() => {
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
