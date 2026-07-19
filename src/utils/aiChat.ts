export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIChatOptions {
  kpId: string;
  kpName: string;
  gradeNum: number;
  explanation?: string;
  messages: ChatMessage[];
  onChunk: (delta: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}

const CLIENT_ID_STORAGE_KEY = 'suan-ai-client-id';
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && CLIENT_ID_PATTERN.test(existing)) return existing;
    const clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
    return clientId;
  } catch {
    return crypto.randomUUID();
  }
}

function readChunkContent(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const data = trimmed.slice(5).trimStart();
  if (!data || data === '[DONE]') return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const choices = (parsed as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const first = choices[0];
    if (typeof first !== 'object' || first === null) return null;
    const delta = (first as { delta?: unknown }).delta;
    if (typeof delta !== 'object' || delta === null) return null;
    const content = (delta as { content?: unknown }).content;
    return typeof content === 'string' ? content : null;
  } catch {
    return null;
  }
}

export async function consumeChatStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (delta: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const content = readChunkContent(line);
      if (content) onChunk(content);
    }
    if (done) break;
  }

  if (buffer) {
    const content = readChunkContent(buffer);
    if (content) onChunk(content);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload === 'object' && payload !== null) {
      const error = (payload as { error?: unknown }).error;
      if (typeof error === 'object' && error !== null) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message) return message;
      }
    }
  } catch {
    // Use a consistent message for non-JSON error responses.
  }
  return `AI 服务请求失败：${response.status}`;
}

export async function streamChat(options: AIChatOptions): Promise<void> {
  const { kpId, kpName, gradeNum, explanation, messages, onChunk, onDone, onError, signal } =
    options;

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-suan-client-id': getClientId(),
      },
      body: JSON.stringify({ kpId, kpName, gradeNum, explanation, messages }),
      signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    if (!response.body) {
      throw new Error('无法读取响应流');
    }

    await consumeChatStream(response.body, onChunk);
    onDone();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}
