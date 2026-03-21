import pLimit from 'p-limit';
import type { Plugin, ViteDevServer } from 'vite';

import { discoverEntryPages } from './discover';
import { installDevServer } from './dev-server';
import { createPageModuleLoader, closePageModuleLoader } from './module-loader';
import { buildPageIndex } from './page-index';
import { renderPage } from './render-runtime';
import {
  buildHtmlAssetReplacementMap,
  collectHtmlAssetRefs,
  rewriteHtmlAssetUrls,
} from './assets';

import type { HtPageInfo, HtPageModule, HtPagesPluginOptions } from './types';
import type { HtmlAssetRef } from './assets';
import { PLUGIN_NAME, VIRTUAL_BUILD_ENTRY_ID } from './constants';

import fs from 'node:fs';
import path from 'node:path';

let hasWarnedESM = false;

function warnIfNotESM(root: string) {
  try {
    const pkgPath = path.join(root, 'package.json');

    if (!fs.existsSync(pkgPath)) return;

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    if (pkg.type !== 'module') {
      console.warn(
        `[${PLUGIN_NAME}] ⚠️ It is recommended to add "type": "module" to your package.json for optimal performance and to avoid Node ESM warnings.`,
      );
    }
  } catch {
    // silent — never break build
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function htPages(options: HtPagesPluginOptions = {}): Plugin {
  let root = process.cwd();
  let server: ViteDevServer | null = null;
  let devPages: HtPageInfo[] = [];
  let htmlAssetRefs = new Map<string, HtmlAssetRef>();

  const cleanUrls = options.cleanUrls ?? true;
  const pagesDir = options.pagesDir ?? 'src';

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

    const loadModule = await createPageModuleLoader({
      mode: 'dev',
      root,
      server,
    });

    for (const entry of entries) {
      const mod = await loadModule(entry.entryPath, entry.relativePath);
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
    const modulesByEntry = new Map<string, HtPageModule>();

    const loadModule = await createPageModuleLoader({
      mode: 'build',
      root,
    });

    for (const entry of entries) {
      const mod = await loadModule(entry.entryPath, entry.relativePath);
      modulesByEntry.set(entry.entryPath, mod);
    }

    const pages = await buildPageIndex({
      entries,
      modulesByEntry,
      cleanUrls,
    });

    return { entries, modulesByEntry, pages };
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

      if (!hasWarnedESM) {
        warnIfNotESM(root);
        hasWarnedESM = true;
      }
    },

    async buildStart() {
      const entries = await discoverEntryPages(root, options);
    
      for (const entry of entries) {
        this.addWatchFile(entry.entryPath);
      }
    
      // emitFile() is build-only
      if (server) {
        return;
      }
    
      htmlAssetRefs.clear();
    
      const { modulesByEntry, pages } = await buildPagesPipeline();
    
      const htmlByPageKey = new Map<string, { html: string; pageDir?: string }>();
    
      for (const page of pages) {
        const mod = modulesByEntry.get(page.entryPath);
    
        if (!mod) {
          throw new Error(
            `[${PLUGIN_NAME}] Missing module for page entry: ${page.entryPath}`,
          );
        }
    
        const html = await renderPage(page, mod, false);
    
        htmlByPageKey.set(page.entryPath, {
          html,
          pageDir: path.dirname(page.absolutePath),
        });
      }
    
      htmlAssetRefs = await collectHtmlAssetRefs({
        ctx: this,
        root,
        pagesDir,
        htmlByPageKey,
      });
    
      logDebug(
        options.debug,
        'collected html assets',
        [...htmlAssetRefs.values()].map((ref) => ({
          kind: ref.kind,
          originalUrl: ref.originalUrl,
          absolutePath: ref.absolutePath,
        })),
      );
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

      logDebug(options.debug, 'file changed', ctx.file);

      await loadDevPages();
      return undefined;
    },

    async generateBundle(_, bundle) {
      try {
        const { modulesByEntry, pages } = await buildPagesPipeline();

        const assetReplacements = buildHtmlAssetReplacementMap({
          ctx: this,
          refs: htmlAssetRefs,
          bundle,
        });

        logDebug(
          options.debug,
          'asset replacements',
          [...assetReplacements.entries()],
        );

        logDebug(
          options.debug,
          'emitting pages',
          pages.map((p) => p.fileName),
        );

        const limit = pLimit(options.renderConcurrency ?? 8);
        const batchSize =
          options.renderBatchSize ??
          Math.max(options.renderConcurrency ?? 8, 32);

        // ---------------------------
        // 1. Render all pages
        // ---------------------------
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

                let html = await renderPage(page, mod, false);
                html = rewriteHtmlAssetUrls(html, assetReplacements);

                this.emitFile({
                  type: 'asset',
                  fileName: options.mapOutputPath?.(page) ?? page.fileName,
                  source: html,
                });
              }),
            ),
          );
        }

        // ---------------------------
        // 2. 404.html
        // ---------------------------
        const notFoundPage = pages.find((p) => p.routePath === '/404');

        if (notFoundPage) {
          const mod = modulesByEntry.get(notFoundPage.entryPath);

          if (!mod) {
            throw new Error(
              `[${PLUGIN_NAME}] Missing module for 404 page entry: ${notFoundPage.entryPath}`,
            );
          }

          let html = await renderPage(notFoundPage, mod, false);
          html = rewriteHtmlAssetUrls(html, assetReplacements);

          this.emitFile({
            type: 'asset',
            fileName: '404.html',
            source: html,
          });

          logDebug(options.debug, 'generated 404.html from user page');
        } else {
          const default404 = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>404 - Page Not Found</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
      }
      main {
        max-width: 40rem;
        text-align: center;
      }
      h1 {
        font-size: 3rem;
        margin: 0 0 1rem;
      }
      p {
        margin: 0.5rem 0;
        line-height: 1.5;
      }
      a {
        color: inherit;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>404</h1>
      <p>Page not found.</p>
      <p><a href="/">Go back home</a></p>
    </main>
  </body>
</html>
`;

          this.emitFile({
            type: 'asset',
            fileName: '404.html',
            source: default404,
          });

          logDebug(options.debug, 'generated default 404.html');
        }

        // ---------------------------
        // 3. Sitemap
        // ---------------------------
        const sitemapBase = options.site ?? '';

        const sitemapRoutes = [...new Set(pages.map((p) => p.routePath))].filter(
          (route) => !route.includes(':') && !route.includes('*'),
        );

        if (sitemapBase && sitemapRoutes.length > 0) {
          const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes
            .map((route) => `  <url><loc>${sitemapBase}${route}</loc></url>`)
            .join('\n')}\n</urlset>\n`;

          this.emitFile({
            type: 'asset',
            fileName: 'sitemap.xml',
            source: sitemap,
          });

          logDebug(options.debug, 'generated sitemap.xml');
        }

        // ---------------------------
        // 4. RSS
        // ---------------------------
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

          logDebug(options.debug, 'generated rss.xml');
        }

        // ---------------------------
        // 5. Remove virtual entry chunk
        // ---------------------------
        for (const [fileName, output] of Object.entries(bundle)) {
          if (
            output.type === 'chunk' &&
            output.facadeModuleId === VIRTUAL_BUILD_ENTRY_ID
          ) {
            delete bundle[fileName];
          }
        }
      } finally {
        await closePageModuleLoader();
      }
    },
  };
}

export default htPages;