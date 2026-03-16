import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pLimit from 'p-limit';
import type { Plugin, ViteDevServer } from 'vite';

import { discoverEntryPages } from './discover';
import { installDevServer } from './dev-server';
import { buildPageIndex } from './page-index';
import { buildRenderBundle } from './render-bundle';
import { renderPage } from './render-runtime';

import type { HtPageInfo, HtPageModule, HtPagesPluginOptions } from './types';
import {
  PLUGIN_NAME,
  VIRTUAL_BUILD_ENTRY_ID,
  CACHE_DIR_NAME,
} from './constants';

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function importManifest(
  bundlePath: string,
): Promise<Array<{ page: HtPageInfo; mod: HtPageModule }>> {
  const mod = await import(pathToFileURL(bundlePath).href + `?t=${Date.now()}`);
  return mod.manifest as Array<{ page: HtPageInfo; mod: HtPageModule }>;
}

export function htPages(options: HtPagesPluginOptions = {}): Plugin {
  let root = process.cwd();
  let server: ViteDevServer | null = null;
  let devPages: HtPageInfo[] = [];

  const cleanUrls = options.cleanUrls ?? true;

  function logDebug(enabled: boolean | undefined, ...args: unknown[]) {
    if (!enabled) return;
    console.log(`[${PLUGIN_NAME}]`, ...args);
  }

  async function loadDevPages(): Promise<HtPageInfo[]> {
    const entries = await discoverEntryPages(root, options);
    const modulesByEntry = new Map<string, HtPageModule>();

    logDebug(
      options.debug,
      'discovered entries',
      entries.map((e) => e.relativePath),
    );

    if (!server) return [];

    for (const entry of entries) {
      const mod = (await server.ssrLoadModule(
        `/${entry.relativePath}`,
      )) as HtPageModule;

      modulesByEntry.set(entry.entryPath, mod);
    }

    devPages = await buildPageIndex({
      entries,
      modulesByEntry,
      cleanUrls,
    });

    logDebug(
      options.debug,
      'dev pages',
      devPages.map((p) => `${p.routePath} -> ${p.relativePath}`),
    );

    return devPages;
  }

  async function buildPagesPipeline() {
    const entries = await discoverEntryPages(root, options);
    const cacheDir = path.join(root, CACHE_DIR_NAME);

    const bundlePath = await buildRenderBundle({
      entries,
      cacheDir,
      ssrPlugins: options.ssrPlugins,
    });

    logDebug(options.debug, 'render bundle', bundlePath);

    const manifest = await importManifest(bundlePath);
    const modulesByEntry = new Map<string, HtPageModule>();

    for (const rec of manifest) {
      modulesByEntry.set(rec.page.entryPath, rec.mod);
    }

    const pages = await buildPageIndex({
      entries,
      modulesByEntry,
      cleanUrls,
    });

    return { entries, bundlePath, modulesByEntry, pages };
  }

  return {
    name: PLUGIN_NAME,

    config(userConfig, env) {
      if (env.command !== 'build') return;

      const hasExplicitInput = userConfig.build?.rollupOptions?.input != null;
      if (hasExplicitInput) return;

      return {
        build: {
          rollupOptions: {
            input: VIRTUAL_BUILD_ENTRY_ID,
          },
        },
      };
    },

    resolveId(id) {
      if (id === VIRTUAL_BUILD_ENTRY_ID) return id;
      return null;
    },

    load(id) {
      if (id === VIRTUAL_BUILD_ENTRY_ID) {
        return 'export default {};';
      }
      return null;
    },

    configResolved(resolved) {
      root = resolved.root;
    },

    async buildStart() {
      const entries = await discoverEntryPages(root, options);

      for (const entry of entries) {
        this.addWatchFile(entry.entryPath);
      }
    },

    configureServer(_server) {
      server = _server;

      installDevServer({
        server,
        getPages: async () => {
          if (devPages.length > 0) return devPages;
          return loadDevPages();
        },
        getEntries: async () => discoverEntryPages(root, options),
      });

      loadDevPages().catch((error) => {
        server?.config.logger.error(
          `[${PLUGIN_NAME}] loadDevPages failed: ${
            error instanceof Error ? error.stack ?? error.message : String(error)
          }`,
        );
      });
    },

    async handleHotUpdate(ctx) {
      if (!server) return;

      if (!ctx.file.endsWith('.ht.js')) {
        return;
      }

      logDebug(options.debug, 'page updated', ctx.file);

      await loadDevPages();
      return undefined;
    },

    async generateBundle(_, bundle) {
      const { modulesByEntry, pages } = await buildPagesPipeline();

      logDebug(
        options.debug,
        'emitting pages',
        pages.map((p) => p.fileName),
      );

      const limit = pLimit(options.renderConcurrency ?? 8);
      const batchSize =
        options.renderBatchSize ??
        Math.max(options.renderConcurrency ?? 8, 32);

      for (const batch of chunkArray(pages, batchSize)) {
        await Promise.all(
          batch.map((page) =>
            limit(async () => {
              const mod = modulesByEntry.get(page.entryPath);
              if (!mod) {
                throw new Error(
                  `[${PLUGIN_NAME}] Missing module for page entry: ${page.entryPath}`,
                );
              }

              const html = await renderPage(page, mod, false);

              this.emitFile({
                type: 'asset',
                fileName: options.mapOutputPath?.(page) ?? page.fileName,
                source: html,
              });
            }),
          ),
        );
      }

      const sitemapBase = options.site ?? '';
      const sitemapRoutes = [...new Set(pages.map((p) => p.routePath))].filter(
        (route) => !route.includes(':') && !route.includes('*'),
      );

      if (sitemapRoutes.length > 0) {
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes
          .map((route) => `  <url><loc>${sitemapBase}${route}</loc></url>`)
          .join('\n')}\n</urlset>\n`;

        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: sitemap,
        });
      }

      if (options.rss?.site) {
        const routePrefix = options.rss.routePrefix ?? '/blog';

        const rssItems = pages
          .filter((page) => page.routePath.startsWith(routePrefix))
          .map((page) => {
            const url = `${options.rss!.site}${page.routePath}`;
            return `  <item>\n    <title>${page.routePath}</title>\n    <link>${url}</link>\n    <guid>${url}</guid>\n  </item>`;
          })
          .join('\n');

        const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>${options.rss.title ?? PLUGIN_NAME}</title>\n  <link>${options.rss.site}</link>\n  <description>${options.rss.description ?? 'RSS feed'}</description>\n${rssItems}\n</channel>\n</rss>\n`;

        this.emitFile({
          type: 'asset',
          fileName: 'rss.xml',
          source: rss,
        });
      }

      for (const [fileName, output] of Object.entries(bundle)) {
        if (
          output.type === 'chunk' &&
          output.facadeModuleId === VIRTUAL_BUILD_ENTRY_ID
        ) {
          delete bundle[fileName];
        }
      }
    },
  };
}
