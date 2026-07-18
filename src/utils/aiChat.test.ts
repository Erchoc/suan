import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeChatStream, streamChat } from './aiChat';

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function createChatCallbacks() {
  return {
    onChunk: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('consumeChatStream', () => {
  it('handles OpenAI SSE frames split across chunks', async () => {
    const onChunk = vi.fn();
    await consumeChatStream(
      streamFromChunks([
        'data: {"choices":[{"delta":{"cont',
        'ent":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n',
        '\ndata: [DONE]\n\n',
      ]),
      onChunk,
    );

    expect(onChunk.mock.calls.map(call => call[0])).toEqual(['你', '好']);
  });

  it('ignores malformed lines and handles a final frame without a trailing newline', async () => {
    const chunks: string[] = [];
    await consumeChatStream(
      streamFromChunks([
        'event: message\n',
        'data: not-json\n',
        'data:{"choices":[{"delta":{"content":"完成"}}]}',
      ]),
      chunk => chunks.push(chunk),
    );

    expect(chunks).toEqual(['完成']);
  });
});

describe('streamChat', () => {
  it('sends the same-origin contract, persists a client ID, and completes the SSE stream', async () => {
    const storage = createMemoryStorage();
    const randomUUID = vi.fn(() => CLIENT_ID);
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          streamFromChunks([
            'data: {"choices":[{"delta":{"content":"答"}}]}\n',
            'data: {"choices":[{"delta":{"content":"案"}}]}\n\ndata: [DONE]\n\n',
          ]),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('crypto', { randomUUID });
    vi.stubGlobal('fetch', fetchMock);
    const callbacks = createChatCallbacks();

    await streamChat({
      kpId: '1-1',
      kpName: 'Counting',
      gradeNum: 1,
      explanation: 'Count visible objects.',
      messages: [{ role: 'user', content: 'How many?' }],
      ...callbacks,
    });

    expect(callbacks.onChunk.mock.calls.map(call => call[0])).toEqual(['答', '案']);
    expect(callbacks.onDone).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(storage.getItem('suan-ai-client-id')).toBe(CLIENT_ID);

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/chat');
    expect(request).toMatchObject({ method: 'POST' });
    expect(new Headers(request?.headers).get('x-suan-client-id')).toBe(CLIENT_ID);
    expect(JSON.parse(String(request?.body))).toEqual({
      kpId: '1-1',
      kpName: 'Counting',
      gradeNum: 1,
      explanation: 'Count visible objects.',
      messages: [{ role: 'user', content: 'How many?' }],
    });
  });

  it('surfaces a structured API error without calling the completion callback', async () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('crypto', { randomUUID: () => CLIENT_ID });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: '请求太频繁，请稍后再试' } }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const callbacks = createChatCallbacks();

    await streamChat({
      kpId: '1-1',
      kpName: 'Counting',
      gradeNum: 1,
      messages: [{ role: 'user', content: 'Help' }],
      ...callbacks,
    });

    expect(callbacks.onDone).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(callbacks.onError.mock.calls[0][0]).toEqual(new Error('请求太频繁，请稍后再试'));
  });

  it('uses the status fallback for non-JSON errors and rejects an empty success body', async () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('crypto', { randomUUID: () => CLIENT_ID });
    const callbacks = createChatCallbacks();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('gateway unavailable', { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const options = {
      kpId: '1-1',
      kpName: 'Counting',
      gradeNum: 1,
      messages: [{ role: 'user' as const, content: 'Help' }],
    };
    await streamChat({ ...options, ...callbacks });
    expect(callbacks.onError.mock.calls[0][0]).toEqual(new Error('AI 服务请求失败：502'));

    callbacks.onError.mockClear();
    await streamChat({ ...options, ...callbacks });
    expect(callbacks.onError.mock.calls[0][0]).toEqual(new Error('无法读取响应流'));
  });

  it('silently stops when the request is aborted', async () => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('crypto', { randomUUID: () => CLIENT_ID });
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(abortError)),
    );
    const callbacks = createChatCallbacks();

    await streamChat({
      kpId: '1-1',
      kpName: 'Counting',
      gradeNum: 1,
      messages: [{ role: 'user', content: 'Help' }],
      ...callbacks,
    });

    expect(callbacks.onDone).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
