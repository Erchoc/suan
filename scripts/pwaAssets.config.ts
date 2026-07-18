import { defineConfig, minimalPreset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimalPreset,
    // apple-touch-icon adds 10% padding (about 18px) by default, which creates a white border.
    // Set it to 0 so the dark background reaches every edge; iOS applies the rounded mask.
    apple: {
      sizes: [180],
      padding: 0,
    },
  },
  images: ['public/favicon.svg'],
});
