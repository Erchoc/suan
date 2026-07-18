import { defineConfig, minimalPreset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimalPreset,
    // apple-touch-icon 默认有 10% padding（约 18px），会产生白边
    // 设为 0 让深色背景贴合到四边，iOS 系统自行裁出圆角
    apple: {
      sizes: [180],
      padding: 0,
    },
  },
  images: ['public/favicon.svg'],
});
