import { type Context, Hono } from 'hono';
import {
  ADMIN_SESSION_COOKIE,
  buildAdminSessionCookie,
  buildExpiredAdminSessionCookie,
  constantTimeStringMatches,
  createAdminSession,
  getDailyAdminPasscode,
  readCookie,
  verifyAdminSession,
} from './adminAuth';
import {
  batchSetQuestionStatus,
  dismissOpenQuestionReports,
  getPublishedQuestion,
  isMissingQuestionBankSchema,
  listAdminQuestions,
  listOpenQuestionReports,
  listPublishedQuestions,
  parseQuestionPatch,
  QuestionBankError,
  type QuestionDifficulty,
  type QuestionType,
  submitQuestionReport,
  updateQuestion,
} from './questionBank';
import {
  cancelQuestionTask,
  createQuestionTask,
  failQuestionTask,
  getQuestionTask,
  listQuestionTasks,
  parseQuestionTaskRequest,
} from './questionTasks';
import {
  SmsProviderError,
  type SmsSendResult,
  sendTencentSmsCode,
  type TencentSmsConfig,
} from './tencentSms';
import {
  activateSmsChallenge,
  buildExpiredUserSessionCookie,
  buildUserSessionCookie,
  consumeOAuthState,
  consumeSmsChallenge,
  createOAuthState,
  createSmsChallenge,
  createUserSession,
  digestSmsCode,
  failSmsChallenge,
  getSmsSendAllowance,
  getUserSession,
  maskPhone,
  normalizeMainlandPhone,
  resolvePhoneUser,
  resolveWechatUser,
  revokeUserSession,
  SMS_CODE_TTL_SECONDS,
  SMS_RESEND_SECONDS,
  sanitizeReturnTo,
  USER_SESSION_COOKIE,
} from './userAuth';

export { QuestionTaskWorkflow } from './questionTaskWorkflow';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOTAL_MESSAGE_CHARS = 20_000;
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUESTION_REPORT_SOURCES = new Set(['exam', 'review']);

type ApiStatus = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 502 | 503;

type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'AUTH_REQUIRED'
  | 'ADMIN_NOT_CONFIGURED'
  | 'CONFLICT'
  | 'FORBIDDEN_ORIGIN'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'UPSTREAM_ERROR'
  | 'AI_NOT_CONFIGURED'
  | 'QUESTION_BANK_NOT_READY'
  | 'AUTH_NOT_CONFIGURED'
  | 'INVALID_CODE'
  | 'ACCOUNT_CONFLICT';

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
  randomToken: () => string;
  generateSmsCode: () => string;
  sendSmsCode: (
    config: TencentSmsConfig,
    phone: string,
    code: string,
    nowMs: number,
  ) => Promise<SmsSendResult>;
}

type OptionalAuthBindings = {
  USER_AUTH_SECRET?: unknown;
  TENCENT_SMS_SECRET_ID?: unknown;
  TENCENT_SMS_SECRET_KEY?: unknown;
  TENCENT_SMS_SDK_APP_ID?: unknown;
  TENCENT_SMS_SIGN_NAME?: unknown;
  TENCENT_SMS_TEMPLATE_ID?: unknown;
  TENCENT_SMS_REGION?: unknown;
  WECHAT_APP_ID?: unknown;
  WECHAT_APP_SECRET?: unknown;
};

interface AuthProviderConfig {
  userAuthSecret: string | null;
  sms: TencentSmsConfig | null;
  wechat: { appId: string; appSecret: string } | null;
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
      throw new ApiError(403, 'FORBIDDEN_ORIGIN', '不允许跨站调用接口');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, 'FORBIDDEN_ORIGIN', 'Origin 请求头无效');
  }
}

function assertJsonRequest(c: Context<AppEnv>): void {
  const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type 必须是 application/json');
  }
}

function readAdminSecret(c: Context<AppEnv>): string {
  const secret = c.env.ADMIN_SESSION_SECRET;
  if (typeof secret !== 'string' || secret.trim().length < 24) {
    throw new ApiError(503, 'ADMIN_NOT_CONFIGURED', '题库后台尚未配置管理员密钥');
  }
  return secret.trim();
}

async function isAdminAuthenticated(c: Context<AppEnv>, nowMs: number): Promise<boolean> {
  const secret = readAdminSecret(c);
  const cookie = readCookie(c.req.header('cookie'), ADMIN_SESSION_COOKIE);
  return verifyAdminSession(cookie, secret, nowMs);
}

async function assertAdminAuthenticated(c: Context<AppEnv>, nowMs: number): Promise<void> {
  if (!(await isAdminAuthenticated(c, nowMs))) {
    throw new ApiError(401, 'AUTH_REQUIRED', '管理员登录已失效，请重新登录');
  }
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
  key: string,
): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ApiError(400, 'BAD_REQUEST', `${key} 不合法`);
  }
  return parsed;
}

function readQuestionDifficulty(value: string | undefined): QuestionDifficulty | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'easy' || value === 'medium' || value === 'hard') return value;
  throw new ApiError(400, 'BAD_REQUEST', 'difficulty 不合法');
}

function readQuestionType(value: string | undefined): QuestionType | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'fill_blank' || value === 'choice' || value === 'mixed') return value;
  throw new ApiError(400, 'BAD_REQUEST', 'type 不合法');
}

function readQuestionStatus(value: string | undefined): 'enabled' | 'disabled' | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'enabled' || value === 'disabled') return value;
  throw new ApiError(400, 'BAD_REQUEST', 'status 不合法');
}

function getRateLimitKey(c: Context<AppEnv>, scope: string): string {
  const connectingIp = c.req.header('cf-connecting-ip')?.trim();
  if (connectingIp && connectingIp.length <= 64) return `${scope}:ip:${connectingIp}`;
  const clientId = c.req.header('x-suan-client-id') ?? '';
  if (!CLIENT_ID_PATTERN.test(clientId)) {
    throw new ApiError(400, 'BAD_REQUEST', '缺少有效的客户端标识');
  }
  return `${scope}:client:${clientId}`;
}

function formatSqlTimestamp(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function readOptionalSecret(value: unknown, minimumLength = 1): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length >= minimumLength ? normalized : null;
}

function getAuthProviderConfig(bindings: CloudflareBindings): AuthProviderConfig {
  const optional = bindings as CloudflareBindings & OptionalAuthBindings;
  const userAuthSecret = readOptionalSecret(optional.USER_AUTH_SECRET, 32);
  const secretId = readOptionalSecret(optional.TENCENT_SMS_SECRET_ID);
  const secretKey = readOptionalSecret(optional.TENCENT_SMS_SECRET_KEY);
  const sdkAppId = readOptionalSecret(optional.TENCENT_SMS_SDK_APP_ID);
  const signName = readOptionalSecret(optional.TENCENT_SMS_SIGN_NAME);
  const templateId = readOptionalSecret(optional.TENCENT_SMS_TEMPLATE_ID);
  const appId = readOptionalSecret(optional.WECHAT_APP_ID);
  const appSecret = readOptionalSecret(optional.WECHAT_APP_SECRET);
  return {
    userAuthSecret,
    sms:
      secretId && secretKey && sdkAppId && signName && templateId
        ? {
            secretId,
            secretKey,
            sdkAppId,
            signName,
            templateId,
            region: readOptionalSecret(optional.TENCENT_SMS_REGION) ?? undefined,
          }
        : null,
    wechat: appId && appSecret ? { appId, appSecret } : null,
  };
}

function createRandomSmsCode(): string {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return String(100_000 + (random[0] % 900_000));
}

function createRandomToken(): string {
  const left = crypto.randomUUID().replaceAll('-', '');
  const right = crypto.randomUUID().replaceAll('-', '');
  return `${left}${right}`;
}

function readCurrentUserToken(c: Context<AppEnv>): string | undefined {
  return readCookie(c.req.header('cookie'), USER_SESSION_COOKIE);
}

function parseWechatPayload(payload: unknown): {
  accessToken: string;
  openId: string;
  unionId: string | null;
} | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.access_token !== 'string' || typeof payload.openid !== 'string') return null;
  return {
    accessToken: payload.access_token,
    openId: payload.openid,
    unionId: typeof payload.unionid === 'string' && payload.unionid ? payload.unionid : null,
  };
}

function accountRedirect(requestUrl: string, code: 'wechat_failed' | 'wechat_conflict'): string {
  const target = new URL('/account', requestUrl);
  target.searchParams.set('error', code);
  return target.toString();
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies: AppDependencies = {
    fetch: (input, init) => globalThis.fetch(input, init),
    now: Date.now,
    randomUUID: () => crypto.randomUUID(),
    randomToken: createRandomToken,
    generateSmsCode: createRandomSmsCode,
    sendSmsCode: (config, phone, code, nowMs) =>
      sendTencentSmsCode(globalThis.fetch, config, phone, code, nowMs),
    ...overrides,
  };
  const app = new Hono<AppEnv>();

  app.use('/api/*', async (c, next) => {
    const traceId = dependencies.randomUUID();
    const startedAt = dependencies.now();
    c.set('traceId', traceId);

    await next();

    c.header('x-trace-id', traceId);
    if (!c.res.headers.has('cache-control')) c.header('cache-control', 'no-store');
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
      contentDatabase: c.env.CONTENT_DB ? 'configured' : 'unconfigured',
    }),
  );

  app.get('/api/auth/config', c => {
    const config = getAuthProviderConfig(c.env);
    return c.json({
      methods: {
        phone: Boolean(config.userAuthSecret && config.sms),
        wechat: Boolean(config.wechat),
      },
    });
  });

  app.get('/api/auth/session', async c => {
    const session = await getUserSession(
      c.env.CONTENT_DB,
      readCurrentUserToken(c),
      dependencies.now(),
    );
    return c.json({ authenticated: Boolean(session), user: session?.user ?? null });
  });

  app.delete('/api/auth/session', async c => {
    assertSameOrigin(c);
    await revokeUserSession(c.env.CONTENT_DB, readCurrentUserToken(c), dependencies.now());
    c.header('set-cookie', buildExpiredUserSessionCookie(new URL(c.req.url).protocol === 'https:'));
    return c.json({ authenticated: false, user: null });
  });

  app.post('/api/auth/sms/send', async c => {
    assertSameOrigin(c);
    assertJsonRequest(c);
    const rateLimit = await c.env.AUTH_RATE_LIMITER.limit({
      key: getRateLimitKey(c, 'auth-sms-send'),
    });
    if (!rateLimit.success) {
      c.header('retry-after', '60');
      throw new ApiError(429, 'RATE_LIMITED', '验证码发送过于频繁，请稍后再试');
    }
    const config = getAuthProviderConfig(c.env);
    if (!config.userAuthSecret || !config.sms) {
      throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '手机号登录服务尚未配置');
    }
    const body = await readJsonWithLimit(c.req.raw);
    if (!isRecord(body)) throw new ApiError(400, 'BAD_REQUEST', '请求体必须是对象');
    const rawPhone = readBoundedString(body, 'phone', 24);
    const phone = normalizeMainlandPhone(rawPhone);
    if (!phone) throw new ApiError(400, 'BAD_REQUEST', '请输入正确的中国大陆手机号');

    const allowance = await getSmsSendAllowance(c.env.CONTENT_DB, phone, dependencies.now());
    if (!allowance.allowed) {
      c.header('retry-after', String(allowance.retryAfterSeconds));
      throw new ApiError(429, 'RATE_LIMITED', '验证码发送过于频繁，请稍后再试');
    }

    const challengeId = dependencies.randomUUID();
    const code = dependencies.generateSmsCode();
    const digest = await digestSmsCode(config.userAuthSecret, challengeId, phone, code);
    await createSmsChallenge(c.env.CONTENT_DB, challengeId, phone, digest, dependencies.now());
    try {
      const sent = await dependencies.sendSmsCode(config.sms, phone, code, dependencies.now());
      await activateSmsChallenge(c.env.CONTENT_DB, challengeId, sent.messageId, dependencies.now());
    } catch (error) {
      await failSmsChallenge(c.env.CONTENT_DB, challengeId, dependencies.now());
      console.error({
        event: 'sms_send_failed',
        traceId: c.get('traceId'),
        reason: error instanceof SmsProviderError ? error.reason : 'unknown',
      });
      throw new ApiError(502, 'UPSTREAM_ERROR', '短信暂时发送失败，请稍后再试');
    }
    return c.json({
      data: {
        challengeId,
        phone: maskPhone(phone),
        expiresIn: SMS_CODE_TTL_SECONDS,
        resendAfter: SMS_RESEND_SECONDS,
      },
    });
  });

  app.post('/api/auth/sms/verify', async c => {
    assertSameOrigin(c);
    assertJsonRequest(c);
    const rateLimit = await c.env.AUTH_RATE_LIMITER.limit({
      key: getRateLimitKey(c, 'auth-sms-verify'),
    });
    if (!rateLimit.success) {
      c.header('retry-after', '60');
      throw new ApiError(429, 'RATE_LIMITED', '验证尝试过于频繁，请稍后再试');
    }
    const config = getAuthProviderConfig(c.env);
    if (!config.userAuthSecret || !config.sms) {
      throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '手机号登录服务尚未配置');
    }
    const body = await readJsonWithLimit(c.req.raw);
    if (!isRecord(body)) throw new ApiError(400, 'BAD_REQUEST', '请求体必须是对象');
    const rawPhone = readBoundedString(body, 'phone', 24);
    const phone = normalizeMainlandPhone(rawPhone);
    const challengeId = readBoundedString(body, 'challengeId', 80);
    const code = readBoundedString(body, 'code', 6);
    if (!phone || !CLIENT_ID_PATTERN.test(challengeId) || !/^\d{6}$/u.test(code)) {
      throw new ApiError(400, 'BAD_REQUEST', '手机号或验证码格式不正确');
    }
    const consumed = await consumeSmsChallenge(
      c.env.CONTENT_DB,
      challengeId,
      phone,
      code,
      config.userAuthSecret,
      dependencies.now(),
    );
    if (!consumed.ok) {
      throw new ApiError(401, 'INVALID_CODE', '验证码不正确或已失效');
    }
    const userId = await resolvePhoneUser(
      c.env.CONTENT_DB,
      phone,
      dependencies.randomUUID(),
      dependencies.randomUUID(),
      dependencies.now(),
    );
    const token = dependencies.randomToken();
    await createUserSession(
      c.env.CONTENT_DB,
      userId,
      dependencies.randomUUID(),
      token,
      dependencies.now(),
    );
    const session = await getUserSession(c.env.CONTENT_DB, token, dependencies.now());
    c.header('set-cookie', buildUserSessionCookie(token, new URL(c.req.url).protocol === 'https:'));
    return c.json({ authenticated: true, user: session?.user ?? null });
  });

  app.get('/api/auth/wechat/start', async c => {
    const config = getAuthProviderConfig(c.env);
    if (!config.wechat) {
      throw new ApiError(503, 'AUTH_NOT_CONFIGURED', '微信登录服务尚未配置');
    }
    const currentSession = await getUserSession(
      c.env.CONTENT_DB,
      readCurrentUserToken(c),
      dependencies.now(),
    );
    const rawState = dependencies.randomToken();
    await createOAuthState(
      c.env.CONTENT_DB,
      dependencies.randomUUID(),
      rawState,
      sanitizeReturnTo(c.req.query('returnTo')),
      currentSession?.user.id ?? null,
      dependencies.now(),
    );
    const callbackUrl = new URL('/api/auth/wechat/callback', c.req.url).toString();
    const authorizationUrl = new URL('https://open.weixin.qq.com/connect/qrconnect');
    authorizationUrl.searchParams.set('appid', config.wechat.appId);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'snsapi_login');
    authorizationUrl.searchParams.set('state', rawState);
    authorizationUrl.hash = 'wechat_redirect';
    c.header('cache-control', 'no-store');
    return c.redirect(authorizationUrl.toString(), 302);
  });

  app.get('/api/auth/wechat/callback', async c => {
    const config = getAuthProviderConfig(c.env);
    if (!config.wechat) return c.redirect(accountRedirect(c.req.url, 'wechat_failed'), 302);
    const code = c.req.query('code')?.trim() ?? '';
    const rawState = c.req.query('state')?.trim() ?? '';
    if (!code || code.length > 256 || !rawState) {
      return c.redirect(accountRedirect(c.req.url, 'wechat_failed'), 302);
    }
    const oauthState = await consumeOAuthState(c.env.CONTENT_DB, rawState, dependencies.now());
    if (!oauthState) return c.redirect(accountRedirect(c.req.url, 'wechat_failed'), 302);

    try {
      const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
      tokenUrl.searchParams.set('appid', config.wechat.appId);
      tokenUrl.searchParams.set('secret', config.wechat.appSecret);
      tokenUrl.searchParams.set('code', code);
      tokenUrl.searchParams.set('grant_type', 'authorization_code');
      const tokenResponse = await dependencies.fetch(tokenUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      const tokenPayload = parseWechatPayload(await tokenResponse.json());
      if (!tokenResponse.ok || !tokenPayload) throw new Error('Invalid WeChat token response');

      let displayName: string | undefined;
      let avatarUrl: string | undefined;
      const profileUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
      profileUrl.searchParams.set('access_token', tokenPayload.accessToken);
      profileUrl.searchParams.set('openid', tokenPayload.openId);
      profileUrl.searchParams.set('lang', 'zh_CN');
      const profileResponse = await dependencies.fetch(profileUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (profileResponse.ok) {
        const profile = (await profileResponse.json()) as unknown;
        if (isRecord(profile)) {
          if (typeof profile.nickname === 'string') displayName = profile.nickname.slice(0, 80);
          if (typeof profile.headimgurl === 'string') avatarUrl = profile.headimgurl.slice(0, 500);
        }
      }

      const resolved = await resolveWechatUser(
        c.env.CONTENT_DB,
        {
          subject: tokenPayload.unionId
            ? `unionid:${tokenPayload.unionId}`
            : `openid:${tokenPayload.openId}`,
          displayName,
          avatarUrl,
        },
        oauthState.currentUserId,
        dependencies.randomUUID(),
        dependencies.randomUUID(),
        dependencies.now(),
      );
      if (resolved.conflict) {
        return c.redirect(accountRedirect(c.req.url, 'wechat_conflict'), 302);
      }
      const token = dependencies.randomToken();
      await createUserSession(
        c.env.CONTENT_DB,
        resolved.userId,
        dependencies.randomUUID(),
        token,
        dependencies.now(),
      );
      c.header(
        'set-cookie',
        buildUserSessionCookie(token, new URL(c.req.url).protocol === 'https:'),
      );
      const redirectTarget = new URL(oauthState.returnTo, c.req.url);
      redirectTarget.searchParams.set('login', 'wechat');
      return c.redirect(redirectTarget.toString(), 302);
    } catch (error) {
      console.error({
        event: 'wechat_login_failed',
        traceId: c.get('traceId'),
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      return c.redirect(accountRedirect(c.req.url, 'wechat_failed'), 302);
    }
  });

  app.get('/api/questions', async c => {
    const result = await listPublishedQuestions(c.env.CONTENT_DB);
    const etag = `W/"questions-${result.meta.publishedRevision}"`;
    c.header('etag', etag);
    c.header('cache-control', 'public, max-age=300, stale-while-revalidate=86400');
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);
    return c.json({
      data: result.questions,
      total: result.questions.length,
      version: result.meta.publishedRevision,
      source: 'd1',
    });
  });

  app.get('/api/questions/:id', async c => {
    const result = await getPublishedQuestion(c.env.CONTENT_DB, c.req.param('id'));
    c.header('cache-control', 'public, max-age=300, stale-while-revalidate=86400');
    c.header('etag', `W/"question-${result.meta.publishedRevision}-${result.question.id}"`);
    return c.json({ data: result.question, version: result.meta.publishedRevision, source: 'd1' });
  });

  app.post('/api/questions/:id/report', async c => {
    assertSameOrigin(c);
    assertJsonRequest(c);
    const rateLimit = await c.env.REPORT_RATE_LIMITER.limit({
      key: getRateLimitKey(c, 'question-report'),
    });
    if (!rateLimit.success) {
      c.header('retry-after', '60');
      throw new ApiError(429, 'RATE_LIMITED', '反馈提交过于频繁，请稍后再试');
    }
    const questionId = c.req.param('id');
    if (!questionId || questionId.length > 80) {
      throw new ApiError(400, 'BAD_REQUEST', '题目 ID 不合法');
    }
    const body = await readJsonWithLimit(c.req.raw);
    if (!isRecord(body)) throw new ApiError(400, 'BAD_REQUEST', '请求体必须是对象');
    const reason = readBoundedString(body, 'reason', 500);
    const source = readBoundedString(body, 'source', 20);
    const sessionId = readBoundedString(body, 'sessionId', 80);
    if (!QUESTION_REPORT_SOURCES.has(source)) {
      throw new ApiError(400, 'BAD_REQUEST', 'source 不合法');
    }
    if (!CLIENT_ID_PATTERN.test(sessionId)) {
      throw new ApiError(400, 'BAD_REQUEST', 'sessionId 不合法');
    }
    if (!Number.isInteger(body.publishedRevision) || Number(body.publishedRevision) <= 0) {
      throw new ApiError(400, 'BAD_REQUEST', 'publishedRevision 不合法');
    }
    const report = await submitQuestionReport(
      c.env.CONTENT_DB,
      {
        questionId,
        publishedRevision: Number(body.publishedRevision),
        reason,
        source: source as 'exam' | 'review',
        sessionId,
      },
      dependencies.randomUUID(),
      formatSqlTimestamp(dependencies.now()),
    );
    return c.json({ data: report }, 201);
  });

  app.post('/api/admin/session', async c => {
    assertSameOrigin(c);
    assertJsonRequest(c);
    const rateLimit = await c.env.ADMIN_RATE_LIMITER.limit({ key: getRateLimitKey(c, 'admin') });
    if (!rateLimit.success) {
      c.header('retry-after', '60');
      throw new ApiError(429, 'RATE_LIMITED', '登录尝试过于频繁，请稍后再试');
    }
    const body = await readJsonWithLimit(c.req.raw);
    if (!isRecord(body)) throw new ApiError(400, 'BAD_REQUEST', '请求体必须是对象');
    const passcode = readBoundedString(body, 'pw', 4);
    const secret = readAdminSecret(c);
    const expectedPasscode = getDailyAdminPasscode(dependencies.now());
    if (!(await constantTimeStringMatches(passcode, expectedPasscode))) {
      throw new ApiError(401, 'AUTH_REQUIRED', '后台口令不正确或已过期');
    }
    const session = await createAdminSession(secret, dependencies.now(), dependencies.randomUUID());
    c.header(
      'set-cookie',
      buildAdminSessionCookie(session.value, new URL(c.req.url).protocol === 'https:'),
    );
    return c.json({ authenticated: true, expiresAt: session.expiresAt });
  });

  app.get('/api/admin/session', async c =>
    c.json({ authenticated: await isAdminAuthenticated(c, dependencies.now()) }),
  );

  app.delete('/api/admin/session', c => {
    assertSameOrigin(c);
    c.header(
      'set-cookie',
      buildExpiredAdminSessionCookie(new URL(c.req.url).protocol === 'https:'),
    );
    return c.json({ authenticated: false });
  });

  app.get('/api/admin/questions', async c => {
    await assertAdminAuthenticated(c, dependencies.now());
    const query = c.req.query('query')?.trim();
    if (query && query.length > 120) throw new ApiError(400, 'BAD_REQUEST', 'query 过长');
    const grade = c.req.query('grade')?.trim();
    const semester = c.req.query('semester')?.trim();
    if (grade && grade.length > 20) throw new ApiError(400, 'BAD_REQUEST', 'grade 过长');
    if (semester && semester.length > 20) {
      throw new ApiError(400, 'BAD_REQUEST', 'semester 过长');
    }
    const attention = c.req.query('attention');
    if (attention && attention !== 'reported') {
      throw new ApiError(400, 'BAD_REQUEST', 'attention 不合法');
    }
    return c.json(
      await listAdminQuestions(c.env.CONTENT_DB, {
        page: readPositiveInteger(c.req.query('page'), 1, 100_000, 'page'),
        pageSize: readPositiveInteger(c.req.query('pageSize'), 30, 100, 'pageSize'),
        query: query || undefined,
        grade: grade || undefined,
        semester: semester || undefined,
        difficulty: readQuestionDifficulty(c.req.query('difficulty')),
        type: readQuestionType(c.req.query('type')),
        status: readQuestionStatus(c.req.query('status')),
        attention: attention === 'reported' ? 'reported' : undefined,
      }),
    );
  });

  app.get('/api/admin/question-reports', async c => {
    await assertAdminAuthenticated(c, dependencies.now());
    const questionId = c.req.query('questionId')?.trim();
    if (!questionId || questionId.length > 80) {
      throw new ApiError(400, 'BAD_REQUEST', 'questionId 不合法');
    }
    const limit = readPositiveInteger(c.req.query('limit'), 20, 100, 'limit');
    return c.json({ data: await listOpenQuestionReports(c.env.CONTENT_DB, questionId, limit) });
  });

  app.post('/api/admin/question-reports/dismiss', async c => {
    assertSameOrigin(c);
    await assertAdminAuthenticated(c, dependencies.now());
    assertJsonRequest(c);
    const body = await readJsonWithLimit(c.req.raw);
    if (!isRecord(body)) throw new ApiError(400, 'BAD_REQUEST', '请求体必须是对象');
    const questionId = readBoundedString(body, 'questionId', 80);
    const note = readBoundedString(body, 'note', 500);
    const dismissed = await dismissOpenQuestionReports(
      c.env.CONTENT_DB,
      questionId,
      note,
      formatSqlTimestamp(dependencies.now()),
    );
    return c.json({ ok: true, dismissed });
  });

  app.patch('/api/admin/questions/:id', async c => {
    assertSameOrigin(c);
    await assertAdminAuthenticated(c, dependencies.now());
    assertJsonRequest(c);
    const questionId = c.req.param('id');
    if (!questionId || questionId.length > 80) {
      throw new ApiError(400, 'BAD_REQUEST', '题目 ID 不合法');
    }
    const patch = parseQuestionPatch(await readJsonWithLimit(c.req.raw));
    return c.json(
      await updateQuestion(
        c.env.CONTENT_DB,
        questionId,
        patch,
        formatSqlTimestamp(dependencies.now()),
      ),
    );
  });

  app.post('/api/admin/questions/batch-status', async c => {
    assertSameOrigin(c);
    await assertAdminAuthenticated(c, dependencies.now());
    assertJsonRequest(c);
    const body = await readJsonWithLimit(c.req.raw);
    if (!isRecord(body) || !Array.isArray(body.ids) || typeof body.enable !== 'boolean') {
      throw new ApiError(400, 'BAD_REQUEST', 'ids 或 enable 不合法');
    }
    if (!body.ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 80)) {
      throw new ApiError(400, 'BAD_REQUEST', 'ids 包含不合法的题目 ID');
    }
    if (body.reason !== undefined && typeof body.reason !== 'string') {
      throw new ApiError(400, 'BAD_REQUEST', 'reason 必须是字符串');
    }
    const meta = await batchSetQuestionStatus(
      c.env.CONTENT_DB,
      body.ids,
      body.enable,
      body.reason,
      formatSqlTimestamp(dependencies.now()),
    );
    return c.json({ ok: true, updated: new Set(body.ids).size, meta });
  });

  app.post('/api/admin/question-tasks', async c => {
    assertSameOrigin(c);
    await assertAdminAuthenticated(c, dependencies.now());
    assertJsonRequest(c);
    const rateLimit = await c.env.TASK_RATE_LIMITER.limit({
      key: getRateLimitKey(c, 'question-task'),
    });
    if (!rateLimit.success) {
      c.header('retry-after', '60');
      throw new ApiError(429, 'RATE_LIMITED', '题库任务启动过于频繁，请稍后再试');
    }
    const request = parseQuestionTaskRequest(await readJsonWithLimit(c.req.raw));
    const taskId = dependencies.randomUUID();
    const createdAt = formatSqlTimestamp(dependencies.now());
    const task = await createQuestionTask(c.env.CONTENT_DB, taskId, request, createdAt);
    try {
      await c.env.QUESTION_TASK_WORKFLOW.create({
        id: taskId,
        params: { taskId, ...request },
        retention: { successRetention: '3 days', errorRetention: '7 days' },
      });
    } catch (error) {
      await failQuestionTask(
        c.env.CONTENT_DB,
        taskId,
        'Cloudflare Workflow 启动失败，请稍后重试',
        formatSqlTimestamp(dependencies.now()),
      );
      console.error({
        event: 'question_task_start_failed',
        traceId: c.get('traceId'),
        taskId,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new ApiError(503, 'QUESTION_BANK_NOT_READY', '题库任务暂时无法启动');
    }
    return c.json({ data: task }, 201);
  });

  app.get('/api/admin/question-tasks', async c => {
    await assertAdminAuthenticated(c, dependencies.now());
    const limit = readPositiveInteger(c.req.query('limit'), 10, 30, 'limit');
    return c.json({ data: await listQuestionTasks(c.env.CONTENT_DB, limit) });
  });

  app.get('/api/admin/question-tasks/:id', async c => {
    await assertAdminAuthenticated(c, dependencies.now());
    const taskId = c.req.param('id');
    if (!CLIENT_ID_PATTERN.test(taskId)) {
      throw new ApiError(400, 'BAD_REQUEST', '任务 ID 不合法');
    }
    const task = await getQuestionTask(c.env.CONTENT_DB, taskId);
    let runtimeStatus: string | null = null;
    try {
      const instance = await c.env.QUESTION_TASK_WORKFLOW.get(task.workflowInstanceId);
      runtimeStatus = (await instance.status()).status;
    } catch {
      runtimeStatus = null;
    }
    return c.json({ data: task, runtimeStatus });
  });

  app.post('/api/admin/question-tasks/:id/stop', async c => {
    assertSameOrigin(c);
    await assertAdminAuthenticated(c, dependencies.now());
    const taskId = c.req.param('id');
    if (!CLIENT_ID_PATTERN.test(taskId)) {
      throw new ApiError(400, 'BAD_REQUEST', '任务 ID 不合法');
    }
    const task = await getQuestionTask(c.env.CONTENT_DB, taskId);
    if (task.status !== 'queued' && task.status !== 'running') {
      throw new ApiError(409, 'CONFLICT', '任务已经结束');
    }
    const instance = await c.env.QUESTION_TASK_WORKFLOW.get(task.workflowInstanceId);
    await instance.terminate();
    await cancelQuestionTask(c.env.CONTENT_DB, taskId, formatSqlTimestamp(dependencies.now()));
    return c.json({ ok: true });
  });

  app.post('/api/ai/chat', async c => {
    assertSameOrigin(c);
    assertJsonRequest(c);

    const rateLimit = await c.env.AI_RATE_LIMITER.limit({ key: getRateLimitKey(c, 'ai') });
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
    if (error instanceof QuestionBankError) {
      if (error.code === 'NOT_FOUND') {
        return errorResponse(c, 404, 'NOT_FOUND', error.message);
      }
      if (error.code === 'VALIDATION') {
        return errorResponse(c, 400, 'BAD_REQUEST', error.message);
      }
      if (error.code === 'CONFLICT') {
        return errorResponse(c, 409, 'CONFLICT', error.message);
      }
      return errorResponse(c, 503, 'QUESTION_BANK_NOT_READY', error.message);
    }
    if (isMissingQuestionBankSchema(error)) {
      return errorResponse(c, 503, 'QUESTION_BANK_NOT_READY', '题库数据库尚未初始化');
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
