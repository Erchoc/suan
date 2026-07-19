export const AI_PROTOCOLS = ['openai-chat', 'openai-coding', 'anthropic'] as const;

export type AIProtocol = (typeof AI_PROTOCOLS)[number];

export interface AIEnvironment {
  BASE_URL?: string;
  API_KEY?: string;
  MODEL?: string;
  AI_PROTOCOL?: string;
}

export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol: AIProtocol;
}

export interface AITextRequest {
  config: AIConfig;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  fetcher?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_PROTOCOL: AIProtocol = 'openai-chat';
const ANTHROPIC_VERSION = '2023-06-01';

const KNOWN_ENDPOINT_SUFFIXES: readonly (readonly string[])[] = [
  ['chat', 'completions'],
  ['responses'],
  ['messages'],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSuffix(segments: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length > segments.length) return false;
  return suffix.every(
    (segment, index) => segment === segments[segments.length - suffix.length + index],
  );
}

function requireNonEmpty(value: string, variableName: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${variableName} is required`);
  return normalized;
}

export function readAIConfig(environment: AIEnvironment): AIConfig {
  const protocolValue = environment.AI_PROTOCOL?.trim() || DEFAULT_PROTOCOL;
  if (!AI_PROTOCOLS.includes(protocolValue as AIProtocol)) {
    throw new Error(
      `Unsupported AI_PROTOCOL "${protocolValue}". Expected one of: ${AI_PROTOCOLS.join(', ')}`,
    );
  }

  return {
    baseUrl: environment.BASE_URL?.trim() || DEFAULT_BASE_URL,
    apiKey: environment.API_KEY?.trim() || '',
    model: environment.MODEL?.trim() || DEFAULT_MODEL,
    protocol: protocolValue as AIProtocol,
  };
}

export function buildAIEndpoint(baseUrl: string, protocol: AIProtocol): string {
  let url: URL;
  try {
    url = new URL(requireNonEmpty(baseUrl, 'BASE_URL'));
  } catch (error) {
    if (error instanceof Error && error.message === 'BASE_URL is required') throw error;
    throw new Error('BASE_URL must be a valid URL');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error('BASE_URL must use HTTPS; HTTP is allowed only for localhost');
  }
  if (url.username || url.password) {
    throw new Error('BASE_URL must not contain embedded credentials');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const knownSuffix = KNOWN_ENDPOINT_SUFFIXES.find(suffix => hasSuffix(segments, suffix));
  if (knownSuffix) segments.splice(segments.length - knownSuffix.length);

  while (segments.length >= 2 && segments.at(-1) === 'v1' && segments.at(-2) === 'v1') {
    segments.pop();
  }

  if (protocol === 'anthropic') {
    if (segments.at(-1) !== 'v1') segments.push('v1');
    segments.push('messages');
  } else if (protocol === 'openai-coding') {
    segments.push('responses');
  } else {
    segments.push('chat', 'completions');
  }

  url.pathname = `/${segments.join('/')}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function buildRequestBody(
  config: AIConfig,
  prompt: string,
  temperature: number,
  maxTokens: number,
): Record<string, unknown> {
  if (config.protocol === 'openai-coding') {
    return {
      model: config.model,
      input: [{ role: 'user', content: prompt }],
      store: false,
    };
  }

  if (config.protocol === 'anthropic') {
    return {
      model: config.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    };
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  };
  let hostname = '';
  try {
    hostname = new URL(config.baseUrl).hostname;
  } catch {
    // The URL is validated before the request is sent.
  }
  if (
    hostname === 'minimaxi.com' ||
    hostname.endsWith('.minimaxi.com') ||
    /^minimax-/i.test(config.model)
  ) {
    body.max_completion_tokens = maxTokens;
  }
  return body;
}

function extractOpenAIChatText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return null;
  for (const choice of payload.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) continue;
    if (typeof choice.message.content === 'string' && choice.message.content.trim()) {
      return choice.message.content.trim();
    }
  }
  return null;
}

function extractOpenAICodingText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload.output)) return null;

  const parts: string[] = [];
  for (const output of payload.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) continue;
    for (const content of output.content) {
      if (isRecord(content) && typeof content.text === 'string' && content.text.trim()) {
        parts.push(content.text.trim());
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

function extractAnthropicText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.content)) return null;
  const parts = payload.content
    .filter(isRecord)
    .filter(item => item.type === 'text' && typeof item.text === 'string' && item.text.trim())
    .map(item => (item.text as string).trim());
  return parts.length > 0 ? parts.join('\n') : null;
}

export function extractAIText(payload: unknown, protocol: AIProtocol): string {
  const text =
    protocol === 'openai-chat'
      ? extractOpenAIChatText(payload)
      : protocol === 'openai-coding'
        ? extractOpenAICodingText(payload)
        : extractAnthropicText(payload);

  if (!text) {
    throw new Error(`Invalid ${protocol} response: no assistant text was found`);
  }
  return text;
}

async function readErrorDetail(response: Response): Promise<string> {
  const raw = (await response.text()).trim();
  if (!raw) return '';

  try {
    const payload: unknown = JSON.parse(raw);
    if (isRecord(payload)) {
      const nestedError = payload.error;
      const message =
        isRecord(nestedError) && typeof nestedError.message === 'string'
          ? nestedError.message
          : typeof payload.message === 'string'
            ? payload.message
            : '';
      if (message.trim()) return `: ${message.trim().slice(0, 300)}`;
    }
  } catch {
    // Use a bounded plain-text provider error when the response is not JSON.
  }

  return `: ${raw.replace(/\s+/g, ' ').slice(0, 300)}`;
}

export async function requestAIText({
  config,
  prompt,
  temperature = 0.7,
  maxTokens = 8192,
  fetcher = globalThis.fetch,
}: AITextRequest): Promise<string> {
  const apiKey = requireNonEmpty(config.apiKey, 'API_KEY');
  const model = requireNonEmpty(config.model, 'MODEL');
  const normalizedPrompt = requireNonEmpty(prompt, 'AI prompt');
  const normalizedConfig = { ...config, apiKey, model };
  const endpoint = buildAIEndpoint(config.baseUrl, config.protocol);
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };

  if (config.protocol === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = ANTHROPIC_VERSION;
  } else {
    headers.authorization = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        buildRequestBody(normalizedConfig, normalizedPrompt, temperature, maxTokens),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${config.protocol} request failed: ${message}`);
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      `${config.protocol} request failed with HTTP ${response.status} ${response.statusText}${detail}`.trim(),
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Invalid ${config.protocol} response: expected JSON`);
  }
  return extractAIText(payload, config.protocol);
}
