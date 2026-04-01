import path from 'node:path';
import { createServer, type InlineConfig, type ViteDevServer } from 'vite';

import {
  VIRTUAL_PAGE_HELPER_ID,
  RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX,
} from './constants';
import { generateTypedPageHelper } from './page-helper-generator';
import type {
  HtPageInfo,
  HtPageModule,
  HtStructuredPageModule,
} from './types';

export type PageModuleLoader = (
  entryPath: string,
  relativePath: string,
) => Promise<HtPageModule>;

let buildServer: ViteDevServer | null = null;

function isStructuredPageModule(
  value: unknown,
): value is HtStructuredPageModule {
  return (
    !!value &&
    typeof value === 'object' &&
    'render' in value &&
    typeof (value as { render?: unknown }).render === 'function'
  );
}

function normalizeLoadedPageModule(mod: unknown): HtPageModule {
  const pageModule = (mod ?? {}) as HtPageModule;

  if (isStructuredPageModule(pageModule.default)) {
    const structured = pageModule.default;

    return {
      default: structured.render,
      data: structured.data,
      generateStaticParams: structured.generateStaticParams,
      dynamic: structured.dynamic,
      prerender: structured.prerender,
    };
  }

  return pageModule;
}

export async function createPageModuleLoader(args: {
  mode: 'dev' | 'build';
  root: string;
  server?: ViteDevServer | null;
  getPages?: () => Promise<HtPageInfo[]>;
}): Promise<PageModuleLoader> {
  const { mode, root, server, getPages } = args;

  if (mode === 'dev') {
    if (!server) {
      throw new Error('[vite-plugin-html-pages] dev server not available');
    }

    return async (_entryPath, relativePath) => {
      const mod = await server.ssrLoadModule(`/${relativePath}`);
      return normalizeLoadedPageModule(mod);
    };
  }

  if (!getPages) {
    throw new Error(
      '[vite-plugin-html-pages] getPages is required in build mode',
    );
  }

  if (!buildServer) {
    const config: InlineConfig = {
      root,
      configFile: false,
      logLevel: 'error',
      appType: 'custom',
      esbuild: {
        jsx: 'automatic',
        jsxImportSource: 'vite-plugin-html-pages',
      },
      server: {
        middlewareMode: true,
      },
      plugins: [
        {
          name: 'vite-plugin-html-pages:page-helper',

          resolveId(id, importer) {
            if (id === VIRTUAL_PAGE_HELPER_ID && importer) {
              return `${RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX}${importer}`;
            }

            return null;
          },

          async load(id) {
            if (!id.startsWith(RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX)) {
              return null;
            }

            const importer = id.slice(
              RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX.length,
            );

            const pages = await getPages();
            const normalizedImporter = path.resolve(importer);

            const page = pages.find(
              (candidate) =>
                path.resolve(candidate.absolutePath) === normalizedImporter,
            );

            return generateTypedPageHelper(page);
          },
        },
      ],
    };

    buildServer = await createServer(config);
  }

  return async (entryPath) => {
    const relativePath =
      '/' + path.relative(root, entryPath).replace(/\\/g, '/');

    const mod = await buildServer!.ssrLoadModule(relativePath);
    return normalizeLoadedPageModule(mod);
  };
}

export async function closePageModuleLoader(): Promise<void> {
  if (buildServer) {
    await buildServer.close();
    buildServer = null;
  }
}