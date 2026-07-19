import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

process.env.API_KEY ??= 'test-api-key';
process.env.BASE_URL ??= 'https://api.deepseek.com';
process.env.MODEL ??= 'deepseek-v4-flash';
process.env.AI_PROTOCOL ??= 'openai-chat';
process.env.ADMIN_SESSION_SECRET ??= 'test-admin-session-secret-that-is-long-enough';

const questionBankMigrations = await readD1Migrations('./migrations');

const dataCoverageThresholds = {
  statements: 95,
  branches: 95,
  functions: 95,
  lines: 95,
};

const storeCoverageThresholds = {
  statements: 90,
  branches: 85,
  functions: 85,
  lines: 90,
};

const utilityCoverageThresholds = {
  statements: 90,
  branches: 75,
  functions: 95,
  lines: 90,
};

const coreLogicCoverageThresholds = {
  statements: 95,
  branches: 90,
  functions: 100,
  lines: 95,
};

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.jsonc',
      },
      miniflare: {
        bindings: {
          BASE_URL: 'https://api.deepseek.com',
          API_KEY: 'test-api-key',
          MODEL: 'deepseek-v4-flash',
          AI_PROTOCOL: 'openai-chat',
          ADMIN_SESSION_SECRET: 'test-admin-session-secret-that-is-long-enough',
          TEST_MIGRATIONS: questionBankMigrations,
        },
      },
    }),
  ],
  test: {
    include: ['worker/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json-summary', 'lcov'],
      include: [
        'worker/index.ts',
        'worker/adminAuth.ts',
        'worker/questionBank.ts',
        'worker/questionTasks.ts',
        'worker/userAuth.ts',
        'worker/tencentSms.ts',
        'src/data/questions.ts',
        'src/data/questionReports.ts',
        'src/data/kpIndex.ts',
        'src/utils/aiChat.ts',
        'src/utils/graphTraversal.ts',
        'src/utils/promptBuilder.ts',
        'src/utils/themeAppearance.ts',
        'src/utils/judgeAnswer.ts',
        'src/stores/examStore.ts',
        'src/stores/reviewStore.ts',
        'src/stores/previewStore.ts',
        'src/stores/reportStore.ts',
      ],
      exclude: ['**/*.test.ts'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
        'worker/index.ts': {
          statements: 80,
          branches: 65,
          functions: 90,
          lines: 80,
        },
        'worker/adminAuth.ts': utilityCoverageThresholds,
        'worker/questionBank.ts': {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        },
        'worker/questionTasks.ts': {
          statements: 85,
          branches: 75,
          functions: 85,
          lines: 85,
        },
        'worker/userAuth.ts': utilityCoverageThresholds,
        'worker/tencentSms.ts': utilityCoverageThresholds,
        'src/data/questions.ts': dataCoverageThresholds,
        'src/data/questionReports.ts': dataCoverageThresholds,
        'src/data/kpIndex.ts': dataCoverageThresholds,
        'src/stores/examStore.ts': storeCoverageThresholds,
        'src/stores/previewStore.ts': storeCoverageThresholds,
        'src/stores/reportStore.ts': storeCoverageThresholds,
        'src/stores/reviewStore.ts': storeCoverageThresholds,
        'src/utils/aiChat.ts': utilityCoverageThresholds,
        'src/utils/graphTraversal.ts': coreLogicCoverageThresholds,
        'src/utils/judgeAnswer.ts': utilityCoverageThresholds,
        'src/utils/promptBuilder.ts': coreLogicCoverageThresholds,
        'src/utils/themeAppearance.ts': utilityCoverageThresholds,
      },
    },
  },
});
