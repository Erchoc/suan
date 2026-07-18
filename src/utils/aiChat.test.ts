import { describe, expect, it, vi } from 'vitest';
import { consumeChatStream } from './aiChat';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('consumeChatStream', () => {
  it('正确处理跨 chunk 拆分的 OpenAI SSE', async () => {
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

  it('忽略坏行并处理 EOF 前没有换行的最后一帧', async () => {
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
