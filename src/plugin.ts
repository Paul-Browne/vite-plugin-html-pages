import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import pLimit from 'p-limit';
import type { Plugin, ViteDevServer } from 'vite';

import { discoverEntryPages } from './discover';
import { installDevServer } from './dev-server';
import { buildPageIndex } from './page-index';
import { buildRenderBundle } from './render-bundle';
import { renderPage } from './render-runtime';

import type { HtPageInfo, HtPageModule, HtPagesPluginOptions } from './types';
import { PLUGIN_NAME, VIRTUAL_BUILD_ENTRY_ID, CACHE_DIR_NAME } from './constants';

function chunkArray<T>(items: T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    out.push(items.slice(i, i + safeSize));
  }
  return out;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createEntriesKey(entries: HtPageInfo[]): string {
  const raw = entries
    .map((e) => `${e.entryPath}|${e.routePattern}|${e.dynamic}`)
    .join('\n');

  return createHash('sha256').update(raw).digest('hex');
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

  let cachedManifestKey: string | null = null;
  let cachedBundlePath: string | null = null;
  let loadDevPagesInFlight: Promise<HtPageInfo[]> | null = null;

  const cleanUrls = options.cleanUrls ?? true;

  function logDebug(enabled: boolean | undefined, ...args: unknown[]) {
    if (!enabled) return;
    console.log(`[${PLUGIN_NAME}]`, ...args);
  }

  async function loadDevPages(): Promise<HtPageInfo[]> {
    if (loadDevPagesInFlight) return loadDevPagesInFlight;
    loadDevPagesInFlight = doLoadDevPages();
    try {
      return await loadDevPagesInFlight;
    } finally {
      loadDevPagesInFlight = null;
    }
  }

  async function doLoadDevPages(): Promise<HtPageInfo[]> {
    const entries = await discoverEntryPages(root, options);
    const modulesByEntry = new Map<string, HtPageModule>();

    logDebug(options.debug, 'discovered entries', entries.map((e) => e.relativePath));

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

    const entriesKey = createEntriesKey(entries);

    let bundlePath: string;
    if (cachedBundlePath && cachedManifestKey === entriesKey) {
      bundlePath = cachedBundlePath;
    } else {
      bundlePath = await buildRenderBundle({
        entries,
        cacheDir,
        ssrPlugins: options.ssrPlugins,
      });
      cachedManifestKey = entriesKey;
      cachedBundlePath = bundlePath;
    }

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

    // Ensure static hosts get a 404.html
    const notFoundPage = pages.find((p) => p.routePath === '/404');

    if (notFoundPage && !pages.some((p) => p.fileName === '404.html')) {
      pages.push({
        ...notFoundPage,
        fileName: '404.html',
      });
    }   

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
    
      const file = ctx.file;
    
      if (
        file.endsWith('.ht.js') ||
        file.includes('/templates/')
      ) {
        logDebug(options.debug, 'reindex triggered by', file);
        await loadDevPages();
      }
    },

    async generateBundle(_, bundle) {
      const { modulesByEntry, pages } = await buildPagesPipeline();
    
      logDebug(options.debug, 'emitting pages', pages.map((p) => p.fileName));
    
      const concurrency = Math.max(1, options.renderConcurrency ?? 8);
      const limit = pLimit(concurrency);
      const batchSize = Math.max(
        1,
        options.renderBatchSize ?? Math.max(concurrency, 32),
      );
    
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
    
      // Generate sitemap.xml
      const sitemapBase = options.site ?? '';
      const sitemapRoutes = [...new Set(pages.map((p) => p.routePath))]
        .filter((route) => !route.includes(':') && !route.includes('*'));
    
      if (sitemapRoutes.length > 0) {
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${sitemapRoutes
      .map(
        (route) =>
          `  <url><loc>${escapeXml(sitemapBase)}${escapeXml(route)}</loc></url>`,
      )
      .join('\n')}
    </urlset>
    `;
    
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: sitemap,
        });
      }
    
      // Generate rss.xml
      if (options.rss?.site) {
        const routePrefix = options.rss.routePrefix ?? '/blog';
    
        const rssItems = pages
          .filter((page) => page.routePath.startsWith(routePrefix))
          .map((page) => {
            const url = `${options.rss!.site}${page.routePath}`;
            return `  <item>
        <title>${escapeXml(page.routePath)}</title>
        <link>${escapeXml(url)}</link>
        <guid>${escapeXml(url)}</guid>
      </item>`;
          })
          .join('\n');
    
        const rss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
    <channel>
      <title>${escapeXml(options.rss.title ?? PLUGIN_NAME)}</title>
      <link>${escapeXml(options.rss.site)}</link>
      <description>${escapeXml(options.rss.description ?? 'RSS feed')}</description>
    ${rssItems}
    </channel>
    </rss>
    `;
    
        this.emitFile({
          type: 'asset',
          fileName: 'rss.xml',
          source: rss,
        });
      }
    
      // Remove the dummy virtual build entry chunk
      for (const [fileName, output] of Object.entries(bundle)) {
        if (
          output.type === 'chunk' &&
          output.facadeModuleId === VIRTUAL_BUILD_ENTRY_ID
        ) {
          delete bundle[fileName];
        }
      }
    }    

  };
}
