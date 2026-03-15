import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import pLimit from 'p-limit';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { discoverEntryPages } from './discover';
import { installDevServer } from './dev-server';
import { buildPageIndex } from './page-index';
import { buildRenderBundle } from './render-bundle';
import { renderPage } from './render-runtime';
import type { HtPageInfo, HtPageModule, HtPagesPluginOptions } from './types';

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function createEntriesKey(entries: HtPageInfo[]): string {
  const raw = entries
    .map((e) => `${e.entryPath}|${e.routePattern}|${e.dynamic}`)
    .join('\n');

  return createHash('sha256').update(raw).digest('hex');
}

async function importManifest(bundlePath: string): Promise<Array<{ page: HtPageInfo; mod: HtPageModule }>> {
  const mod = await import(pathToFileURL(bundlePath).href + `?t=${Date.now()}`);
  return mod.manifest as Array<{ page: HtPageInfo; mod: HtPageModule }>;
}

export function htPages(options: HtPagesPluginOptions = {}): Plugin {
  let root = process.cwd();
  let server: ViteDevServer | null = null;
  let config: ResolvedConfig;
  let devPages: HtPageInfo[] = [];
  let cachedManifestKey: string | null = null;
  let cachedBundlePath: string | null = null;
  const cleanUrls = options.cleanUrls ?? true;

  async function loadDevPages(): Promise<HtPageInfo[]> {
    const entries = await discoverEntryPages(root, options);
    const modulesByEntry = new Map<string, HtPageModule>();

    if (!server) return [];

    for (const entry of entries) {
      const mod = (await server.ssrLoadModule(entry.entryPath)) as HtPageModule;
      modulesByEntry.set(entry.entryPath, mod);
    }

    devPages = await buildPageIndex({
      entries,
      modulesByEntry,
      cleanUrls,
    });

    return devPages;
  }

  return {
    name: 'vite-plugin-ht-pages',

    configResolved(resolved) {
      config = resolved;
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
        getPages: () => devPages,
      });

      loadDevPages().catch((error) => {
        server?.config.logger.error(String(error));
      });

      return () => {
        server = null;
      };
    },

    async handleHotUpdate() {
      if (server) {
        await loadDevPages();
      }
      return undefined;
    },

    async generateBundle() {
      const entries = await discoverEntryPages(root, options);
      const cacheDir = path.join(root, 'node_modules/.cache/vite-plugin-ht-pages');

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

      const limit = pLimit(options.renderConcurrency ?? 8);
      const batchSize = options.renderBatchSize ?? Math.max(options.renderConcurrency ?? 8, 32);

      for (const batch of chunkArray(pages, batchSize)) {
        await Promise.all(
          batch.map((page) =>
            limit(async () => {
              const mod = modulesByEntry.get(page.entryPath);
              if (!mod) throw new Error(`Missing module for page entry: ${page.entryPath}`);
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
    },
  };
}