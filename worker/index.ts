import { type Context, Hono } from 'hono';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOTAL_MESSAGE_CHARS = 20_000;
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ApiStatus = 400 | 403 | 404 | 413 | 415 | 429 | 500 | 502 | 503;

type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'FORBIDDEN_ORIGIN'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'UPSTREAM_ERROR'
  | 'AI_NOT_CONFIGURED';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatRequest {
  kpId: string;
  kpName: string;
  gradeNum: number;
  explanation?: string;
  messages: ChatMessage[];
}

type AiProtocol = 'openai-chat' | 'openai-coding' | 'anthropic';

interface UpstreamRequest {
  url: string;
  init: RequestInit;
}

const UPSTREAM_PATHS: Record<AiProtocol, readonly string[]> = {
  'openai-chat': ['chat', 'completions'],
  'openai-coding': ['responses'],
  anthropic: ['messages'],
};
const KNOWN_UPSTREAM_SUFFIXES: readonly (readonly string[])[] = [
  ['chat', 'completions'],
  ['responses'],
  ['messages'],
];

interface AppVariables {
  traceId: string;
}

type AppEnv = {
  Bindings: CloudflareBindings;
  Variables: AppVariables;
};

interface AppDependencies {
  fetch: typeof globalThis.fetch;
  now: () => number;
  randomUUID: () => string;
}

class ApiError extends Error {
  constructor(
    readonly status: ApiStatus,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonWithLimit(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
  }

  if (!request.body) {
    throw new ApiError(400, 'BAD_REQUEST', '请求体不能为空');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel('payload too large');
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', '请求体必须是有效 JSON');
  }
}

function readBoundedString(record: Record<string, unknown>, key: string, maxLength: number): string;
function readBoundedString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
  options: { optional: true },
): string | undefined;
function readBoundedString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
  options: { optional?: boolean } = {},
): string | undefined {
  const value = record[key];
  if (options.optional && value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'BAD_REQUEST', `${key} 必须是字符串`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ApiError(400, 'BAD_REQUEST', `${key} 长度不合法`);
  }
  return normalized;
}

function parseChatRequest(value: unknown): ChatRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, 'BAD_REQUEST', '请求体必须是对象');
  }

  const kpId = readBoundedString(value, 'kpId', 40);
  const kpName = readBoundedString(value, 'kpName', 80);
  const explanation = readBoundedString(value, 'explanation', 1_000, { optional: true });
  const gradeNum = value.gradeNum;

  if (!Number.isInteger(gradeNum) || Number(gradeNum) < 1 || Number(gradeNum) > 6) {
    throw new ApiError(400, 'BAD_REQUEST', 'gradeNum 必须是 1 到 6 的整数');
  }

  if (
    !Array.isArray(value.messages) ||
    value.messages.length === 0 ||
    value.messages.length > MAX_MESSAGES
  ) {
    throw new ApiError(400, 'BAD_REQUEST', `messages 必须包含 1 到 ${MAX_MESSAGES} 条消息`);
  }

  let totalChars = 0;
  const messages = value.messages.map((message, index): ChatMessage => {
    if (!isRecord(message) || (message.role !== 'user' && message.role !== 'assistant')) {
      throw new ApiError(400, 'BAD_REQUEST', `messages[${index}].role 不合法`);
    }
    if (typeof message.content !== 'string') {
      throw new ApiError(400, 'BAD_REQUEST', `messages[${index}].content 必须是字符串`);
    }
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) {
      throw new ApiError(400, 'BAD_REQUEST', `messages[${index}].content 长度不合法`);
    }
    totalChars += content.length;
    return { role: message.role, content };
  });

  if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
    throw new ApiError(400, 'BAD_REQUEST', '消息总长度超出限制');
  }

  return {
    kpId,
    kpName,
    gradeNum: Number(gradeNum),
    explanation,
    messages,
  };
}

function buildSystemPrompt(request: ChatRequest): string {
  const grade = `${request.gradeNum}年级`;
  if (request.gradeNum <= 3) {
    return `你是一位亲切活泼的小学数学老师，正在帮助${grade}的小朋友预习「${request.kpName}」。用简单的话、短句子回答，每次不超过 80 字，多用鼓励的语气。`;
  }
  const context = request.explanation ? `\n知识点要点：${request.explanation.slice(0, 200)}` : '';
  return `你是一位小学数学老师，正在帮助${grade}的同学预习「${request.kpName}」。${context}\n请准确、简洁地回答问题，不超过 120 字。`;
}

function readConfiguredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', message);
  }
  return value.trim();
}

function parseAiProtocol(value: unknown): AiProtocol {
  if (value === undefined || value === null) return 'openai-chat';
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return 'openai-chat';
    if (
      normalized === 'openai-chat' ||
      normalized === 'openai-coding' ||
      normalized === 'anthropic'
    ) {
      return normalized;
    }
  }
  throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI 协议配置无效');
}

function hasPathSuffix(segments: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length > segments.length) return false;
  return suffix.every(
    (segment, index) => segment === segments[segments.length - suffix.length + index],
  );
}

function buildUpstreamUrl(baseUrl: unknown, protocol: AiProtocol): string {
  const configuredUrl = readConfiguredString(baseUrl, 'AI 服务地址尚未配置');
  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI 服务地址配置无效');
  }

  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) ||
    parsed.username ||
    parsed.password
  ) {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI 服务地址必须使用 HTTPS');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const knownSuffix = KNOWN_UPSTREAM_SUFFIXES.find(suffix => hasPathSuffix(segments, suffix));
  if (knownSuffix) segments.splice(segments.length - knownSuffix.length);
  while (segments.length >= 2 && segments.at(-1) === 'v1' && segments.at(-2) === 'v1') {
    segments.pop();
  }

  const endpoint =
    protocol === 'anthropic' && segments.at(-1) !== 'v1'
      ? ['v1', ...UPSTREAM_PATHS.anthropic]
      : UPSTREAM_PATHS[protocol];
  parsed.pathname = `/${[...segments, ...endpoint].join('/')}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function buildUpstreamRequest(
  bindings: CloudflareBindings,
  request: ChatRequest,
  protocol: AiProtocol,
  signal: AbortSignal,
): UpstreamRequest {
  const model = readConfiguredString(bindings.MODEL, 'AI 模型尚未配置');
  const apiKey = readConfiguredString(bindings.API_KEY, 'AI 辅导功能尚未配置');
  const systemPrompt = buildSystemPrompt(request);
  const headers: Record<string, string> = {
    accept: 'text/event-stream',
    'content-type': 'application/json',
  };
  let body: Record<string, unknown>;

  if (protocol === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model,
      max_tokens: 512,
      system: systemPrompt,
      messages: request.messages,
      stream: true,
    };
  } else {
    headers.authorization = `Bearer ${apiKey}`;
    body =
      protocol === 'openai-coding'
        ? {
            model,
            instructions: systemPrompt,
            input: request.messages,
            stream: true,
            store: false,
          }
        : {
            model,
            messages: [{ role: 'system', content: systemPrompt }, ...request.messages],
            stream: true,
          };
  }

  return {
    url: buildUpstreamUrl(bindings.BASE_URL, protocol),
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    },
  };
}

interface ParsedSseEvent {
  event: string;
  data: string;
}

function parseSseEvent(block: string): ParsedSseEvent | null {
  let event = '';
  const data: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '');
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? '' : line.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

function normalizeUpstreamStream(
  stream: ReadableStream<Uint8Array>,
  protocol: Exclude<AiProtocol, 'openai-chat'>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let completed = false;
  let failed = false;

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      drainEvents(controller);
    },
    flush(controller) {
      buffer += decoder.decode();
      drainEvents(controller, true);
      if (!completed && !failed) failStream(controller);
    },
  });

  function emitContent(controller: TransformStreamDefaultController<Uint8Array>, content: string) {
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`),
    );
  }

  function emitDone(controller: TransformStreamDefaultController<Uint8Array>) {
    if (completed) return;
    completed = true;
    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  }

  function failStream(controller: TransformStreamDefaultController<Uint8Array>) {
    failed = true;
    controller.error(new Error('Invalid upstream event stream'));
  }

  function handleEvent(block: string, controller: TransformStreamDefaultController<Uint8Array>) {
    if (completed || failed) return;
    const event = parseSseEvent(block);
    if (!event) return;
    if (event.data === '[DONE]') {
      emitDone(controller);
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(event.data);
    } catch {
      failStream(controller);
      return;
    }
    if (!isRecord(payload)) return;

    const eventType = typeof payload.type === 'string' ? payload.type : event.event;
    if (eventType === 'error' || event.event === 'error' || eventType === 'response.failed') {
      failStream(controller);
      return;
    }

    if (protocol === 'openai-coding') {
      if (eventType === 'response.completed') {
        emitDone(controller);
      } else if (
        (eventType === 'response.output_text.delta' || eventType === 'response.refusal.delta') &&
        typeof payload.delta === 'string'
      ) {
        emitContent(controller, payload.delta);
      }
      return;
    }

    if (eventType === 'message_stop') {
      emitDone(controller);
      return;
    }
    if (eventType !== 'content_block_delta' || !isRecord(payload.delta)) return;
    if (payload.delta.type === 'text_delta' && typeof payload.delta.text === 'string') {
      emitContent(controller, payload.delta.text);
    }
  }

  function drainEvents(controller: TransformStreamDefaultController<Uint8Array>, flush = false) {
    let boundary = buffer.match(/\r?\n\r?\n/);
    while (boundary?.index !== undefined && !failed) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      handleEvent(block, controller);
      boundary = buffer.match(/\r?\n\r?\n/);
    }
    if (flush && buffer.trim() && !failed) {
      handleEvent(buffer, controller);
      buffer = '';
    }
  }

  return stream.pipeThrough(transform);
}

function errorResponse(c: Context<AppEnv>, status: ApiStatus, code: ApiErrorCode, message: string) {
  return c.json(
    {
      error: { code, message },
      traceId: c.get('traceId'),
    },
    status,
  );
}

function assertSameOrigin(c: Context<AppEnv>): void {
  const origin = c.req.header('origin');
  if (!origin) return;
  try {
    if (new URL(origin).origin !== new URL(c.req.url).origin) {
      throw new ApiError(403, 'FORBIDDEN_ORIGIN', '不允许跨站调用 AI 接口');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, 'FORBIDDEN_ORIGIN', 'Origin 请求头无效');
  }
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies: AppDependencies = {
    fetch: (input, init) => globalThis.fetch(input, init),
    now: Date.now,
    randomUUID: () => crypto.randomUUID(),
    ...overrides,
  };
  const app = new Hono<AppEnv>();

  app.use('/api/*', async (c, next) => {
    const traceId = dependencies.randomUUID();
    const startedAt = dependencies.now();
    c.set('traceId', traceId);

    await next();

    c.header('x-trace-id', traceId);
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
    c.header('referrer-policy', 'no-referrer');
    console.log({
      event: 'api_request',
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: dependencies.now() - startedAt,
      traceId,
    });
  });

  app.get('/api/health', c =>
    c.json({
      status: 'ok',
      service: 'suan',
      runtime: 'cloudflare-workers',
      ai: c.env.API_KEY && c.env.BASE_URL && c.env.MODEL ? 'ready' : 'unconfigured',
    }),
  );

  app.post('/api/ai/chat', async c => {
    assertSameOrigin(c);

    const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type 必须是 application/json');
    }

    const clientId = c.req.header('x-suan-client-id') ?? '';
    if (!CLIENT_ID_PATTERN.test(clientId)) {
      throw new ApiError(400, 'BAD_REQUEST', '缺少有效的客户端标识');
    }

    const connectingIp = c.req.header('cf-connecting-ip')?.trim();
    const rateKey =
      connectingIp && connectingIp.length <= 64 ? `ai:ip:${connectingIp}` : `ai:client:${clientId}`;
    const rateLimit = await c.env.AI_RATE_LIMITER.limit({ key: rateKey });
    if (!rateLimit.success) {
      c.header('retry-after', '60');
      throw new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
    }

    if (!c.env.API_KEY) {
      throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI 辅导功能尚未配置');
    }

    const request = parseChatRequest(await readJsonWithLimit(c.req.raw));
    const protocol = parseAiProtocol(c.env.AI_PROTOCOL);
    const upstreamRequest = buildUpstreamRequest(c.env, request, protocol, c.req.raw.signal);

    let upstream: Response;
    try {
      upstream = await dependencies.fetch(upstreamRequest.url, upstreamRequest.init);
    } catch (error) {
      console.error({
        event: 'ai_upstream_fetch_failed',
        traceId: c.get('traceId'),
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new ApiError(502, 'UPSTREAM_ERROR', 'AI 服务暂时不可用');
    }

    if (!upstream.ok || !upstream.body) {
      if (upstream.body) {
        try {
          await upstream.body.cancel();
        } catch {
          // The response is already closed, so no further handling is required.
        }
      }
      console.error({
        event: 'ai_upstream_rejected',
        traceId: c.get('traceId'),
        upstreamStatus: upstream.status,
      });
      throw new ApiError(502, 'UPSTREAM_ERROR', 'AI 服务暂时不可用');
    }

    const responseBody =
      protocol === 'openai-chat' ? upstream.body : normalizeUpstreamStream(upstream.body, protocol);
    return new Response(responseBody, {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type':
          protocol === 'openai-chat'
            ? (upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8')
            : 'text/event-stream; charset=utf-8',
      },
    });
  });

  app.notFound(c => errorResponse(c, 404, 'NOT_FOUND', '接口不存在'));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return errorResponse(c, error.status, error.code, error.message);
    }
    console.error({
      event: 'api_unhandled_error',
      traceId: c.get('traceId'),
      error: error instanceof Error ? error.name : 'UnknownError',
    });
    return errorResponse(c, 500, 'INTERNAL_ERROR', '服务暂时不可用');
  });

  return app;
}

export const app = createApp();

export default app;
