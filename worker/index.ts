import { Hono, type Context } from 'hono';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOTAL_MESSAGE_CHARS = 20_000;
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (!Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > MAX_MESSAGES) {
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
  const context = request.explanation
    ? `\n知识点要点：${request.explanation.slice(0, 200)}`
    : '';
  return `你是一位小学数学老师，正在帮助${grade}的同学预习「${request.kpName}」。${context}\n请准确、简洁地回答问题，不超过 120 字。`;
}

function buildUpstreamUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(`${normalized}/chat/completions`);
  } catch {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI 服务地址配置无效');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI 服务地址必须使用 HTTPS');
  }
  return parsed.toString();
}

function errorResponse(
  c: Context<AppEnv>,
  status: ApiStatus,
  code: ApiErrorCode,
  message: string,
) {
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

  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      service: 'suan',
      runtime: 'cloudflare-workers',
      ai: c.env.AI_API_KEY ? 'ready' : 'unconfigured',
    }),
  );

  app.post('/api/ai/chat', async (c) => {
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
    const rateKey = connectingIp && connectingIp.length <= 64 ? `ai:ip:${connectingIp}` : `ai:client:${clientId}`;
    const rateLimit = await c.env.AI_RATE_LIMITER.limit({ key: rateKey });
    if (!rateLimit.success) {
      c.header('retry-after', '60');
      throw new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
    }

    if (!c.env.AI_API_KEY) {
      throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI 辅导功能尚未配置');
    }

    const request = parseChatRequest(await readJsonWithLimit(c.req.raw));
    const upstreamUrl = buildUpstreamUrl(c.env.AI_BASE_URL);

    let upstream: Response;
    try {
      upstream = await dependencies.fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          accept: 'text/event-stream',
          authorization: `Bearer ${c.env.AI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: c.env.AI_MODEL,
          messages: [
            { role: 'system', content: buildSystemPrompt(request) },
            ...request.messages,
          ],
          stream: true,
        }),
        signal: c.req.raw.signal,
      });
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
          // 响应已关闭，无需再次处理。
        }
      }
      console.error({
        event: 'ai_upstream_rejected',
        traceId: c.get('traceId'),
        upstreamStatus: upstream.status,
      });
      throw new ApiError(502, 'UPSTREAM_ERROR', 'AI 服务暂时不可用');
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
      },
    });
  });

  app.notFound((c) => errorResponse(c, 404, 'NOT_FOUND', '接口不存在'));

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
