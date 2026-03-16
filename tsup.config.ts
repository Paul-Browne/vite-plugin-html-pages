import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  splitting: false,
  external: [
    'vite',
    'rollup',
    'fast-glob',
    'p-limit',
    '@rollup/plugin-node-resolve'
  ],
});