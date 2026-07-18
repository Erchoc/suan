import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

process.env.AI_API_KEY ??= 'test-api-key';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.jsonc',
      },
      miniflare: {
        bindings: {
          AI_API_KEY: 'test-api-key',
        },
      },
    }),
  ],
  test: {
    include: ['worker/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
