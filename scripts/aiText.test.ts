import { describe, expect, it, vi } from 'vitest';
import {
  type AIConfig,
  buildAIEndpoint,
  extractAIText,
  readAIConfig,
  requestAIText,
} from './aiText.ts';

function makeConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    baseUrl: 'https://provider.example/v1',
    apiKey: 'test-key',
    model: 'test-model',
    protocol: 'openai-chat',
    ...overrides,
  };
}

describe('AI text helper', () => {
  it('uses DeepSeek and openai-chat defaults', () => {
    expect(readAIConfig({ API_KEY: ' key ' })).toEqual({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'key',
      model: 'deepseek-v4-flash',
      protocol: 'openai-chat',
    });
  });

  it('rejects unsupported protocols', () => {
    expect(() => readAIConfig({ AI_PROTOCOL: 'openai' })).toThrow(
      'Unsupported AI_PROTOCOL "openai". Expected one of: openai-chat, openai-coding, anthropic',
    );
  });

  it('safely builds provider endpoints and replaces existing endpoint suffixes', () => {
    expect(buildAIEndpoint('https://provider.example/', 'openai-chat')).toBe(
      'https://provider.example/chat/completions',
    );
    expect(buildAIEndpoint('https://provider.example/v1/', 'openai-coding')).toBe(
      'https://provider.example/v1/responses',
    );
    expect(buildAIEndpoint('https://api.anthropic.com', 'anthropic')).toBe(
      'https://api.anthropic.com/v1/messages',
    );
    expect(
      buildAIEndpoint(
        'https://gateway.example/v1/chat/completions?ignored=true#fragment',
        'anthropic',
      ),
    ).toBe('https://gateway.example/v1/messages');
    expect(buildAIEndpoint('https://gateway.example/v1/messages', 'openai-chat')).toBe(
      'https://gateway.example/v1/chat/completions',
    );
  });

  it('rejects unsafe base URLs', () => {
    expect(() => buildAIEndpoint('not-a-url', 'openai-chat')).toThrow(
      'BASE_URL must be a valid URL',
    );
    expect(() => buildAIEndpoint('http://provider.example', 'openai-chat')).toThrow(
      'BASE_URL must use HTTPS',
    );
    expect(() => buildAIEndpoint('https://user:pass@provider.example', 'openai-chat')).toThrow(
      'BASE_URL must not contain embedded credentials',
    );
    expect(buildAIEndpoint('http://localhost:8787/v1', 'openai-chat')).toBe(
      'http://localhost:8787/v1/chat/completions',
    );
  });

  it('calls openai-chat with bearer auth and extracts message content', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ choices: [{ message: { content: ' chat result ' } }] }));

    await expect(
      requestAIText({ config: makeConfig(), prompt: 'prompt', temperature: 0.2, fetcher }),
    ).resolves.toBe('chat result');

    expect(fetcher).toHaveBeenCalledWith(
      'https://provider.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer test-key' }),
      }),
    );
    const request = fetcher.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      model: 'test-model',
      messages: [{ role: 'user', content: 'prompt' }],
      temperature: 0.2,
    });
  });

  it('sends the current completion limit to MiniMax-compatible chat models', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ choices: [{ message: { content: 'result' } }] }));

    await requestAIText({
      config: makeConfig({
        baseUrl: 'https://api.minimaxi.com/v1',
        model: 'MiniMax-M2.7',
      }),
      prompt: 'prompt',
      maxTokens: 4096,
      fetcher,
    });

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      max_completion_tokens: 4096,
    });
  });

  it('calls openai-coding and accepts output_text', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ output_text: 'coding result' }));

    await expect(
      requestAIText({
        config: makeConfig({ protocol: 'openai-coding' }),
        prompt: 'prompt',
        fetcher,
      }),
    ).resolves.toBe('coding result');

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://provider.example/v1/responses');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'test-model',
      input: [{ role: 'user', content: 'prompt' }],
      store: false,
    });
  });

  it('extracts nested output content from openai-coding responses', () => {
    expect(
      extractAIText(
        {
          output: [
            { type: 'reasoning', content: [] },
            {
              type: 'message',
              content: [
                { type: 'output_text', text: 'first' },
                { type: 'output_text', text: 'second' },
              ],
            },
          ],
        },
        'openai-coding',
      ),
    ).toBe('first\nsecond');
  });

  it('calls anthropic with provider headers and extracts text blocks', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        content: [
          { type: 'thinking', thinking: 'hidden' },
          { type: 'text', text: 'anthropic result' },
        ],
      }),
    );

    await expect(
      requestAIText({
        config: makeConfig({ baseUrl: 'https://api.anthropic.com', protocol: 'anthropic' }),
        prompt: 'prompt',
        maxTokens: 2048,
        fetcher,
      }),
    ).resolves.toBe('anthropic result');

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'test-model',
      max_tokens: 2048,
      messages: [{ role: 'user', content: 'prompt' }],
      temperature: 0.7,
    });
  });

  it('reports bounded provider errors and malformed successful responses', async () => {
    const failedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: 'invalid key' } },
          { status: 401, statusText: 'Unauthorized' },
        ),
      );
    await expect(
      requestAIText({ config: makeConfig(), prompt: 'prompt', fetcher: failedFetch }),
    ).rejects.toThrow('openai-chat request failed with HTTP 401 Unauthorized: invalid key');

    const invalidJsonFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not json', { status: 200 }));
    await expect(
      requestAIText({ config: makeConfig(), prompt: 'prompt', fetcher: invalidJsonFetch }),
    ).rejects.toThrow('Invalid openai-chat response: expected JSON');

    const emptyFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [] }));
    await expect(
      requestAIText({ config: makeConfig(), prompt: 'prompt', fetcher: emptyFetch }),
    ).rejects.toThrow('Invalid openai-chat response: no assistant text was found');
  });

  it('requires an API key before sending a request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      requestAIText({ config: makeConfig({ apiKey: '' }), prompt: 'prompt', fetcher }),
    ).rejects.toThrow('API_KEY is required');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
