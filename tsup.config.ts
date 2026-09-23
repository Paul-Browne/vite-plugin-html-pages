import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/page.ts',
    'src/types.ts',
    'src/jsx-runtime.ts',
    'src/jsx-dev-runtime.ts',
  ],
  format: ['esm'],
  // DTS via tsc (tsup's rollup-plugin-dts is incompatible with TypeScript 7)
  dts: false,
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
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/server',
  ],
  tsconfig: './tsconfig.json',
});