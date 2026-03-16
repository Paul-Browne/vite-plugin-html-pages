import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { rollup, type Plugin as RollupPlugin } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { createManifestModule } from './manifest';
import type { HtPageInfo } from './types';
import { PLUGIN_NAME, VIRTUAL_MANIFEST_ID } from './constants';


export async function buildRenderBundle(args: {
  entries: HtPageInfo[];
  cacheDir: string;
  ssrPlugins?: RollupPlugin[];
}): Promise<string> {
  const { entries, cacheDir, ssrPlugins = [] } = args;

  const source = createManifestModule(entries);
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
  const bundlePath = path.join(cacheDir, `render-${hash}.mjs`);

  await fs.mkdir(cacheDir, { recursive: true });

  try {
    await fs.access(bundlePath);
    return bundlePath;
  } catch {
    // cache miss, continue
  }

  const bundle = await rollup({
    input: VIRTUAL_MANIFEST_ID,
    plugins: [
      {
        name: `${PLUGIN_NAME}:virtual-manifest`,
        resolveId(id) {
          return id === VIRTUAL_MANIFEST_ID ? id : null;
        },
        load(id) {
          return id === VIRTUAL_MANIFEST_ID ? source : null;
        },
      },
      nodeResolve({
        preferBuiltins: true,
        exportConditions: ['node'],
      }),
      ...ssrPlugins,
    ],
    treeshake: true,
  });

  try {
    const { output } = await bundle.generate({
      format: 'esm',
      exports: 'named',
      inlineDynamicImports: true,
    });

    const chunk = output.find((item) => item.type === 'chunk');

    if (!chunk || chunk.type !== 'chunk') {
      throw new Error(`[${PLUGIN_NAME}] Failed to generate HT.js pages render bundle.`);
    }

    await fs.writeFile(bundlePath, chunk.code, 'utf8');
    return bundlePath;
  } finally {
    await bundle.close();
  }
}