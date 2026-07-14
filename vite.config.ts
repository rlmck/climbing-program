import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from /<repo-name>/, so production builds need a
// matching base path. Override with VITE_BASE if the repo is named differently.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: mode === 'production' ? env.VITE_BASE || '/climbing-program/' : '/',
    test: {
      environment: 'node',
      include: ['src/domain/**/*.test.ts'],
    },
  };
});
