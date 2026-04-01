import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/page.ts',
    'src/jsx-runtime.ts',
    'src/jsx-dev-runtime.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  platform: 'node',
  splitting: false,
  external: [
    'vite',
    'fast-glob',
    'p-limit',
    'esbuild',
    'javascript-to-html',
  ],
  tsconfig: './tsconfig.json'
});