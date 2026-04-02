import fs from 'node:fs';
import path from 'node:path';
import type { ViteDevServer } from 'vite';

import { renderPage } from './render-runtime';
import type { HtPageInfo } from './types';
import { PLUGIN_NAME } from './constants';
import { createPageModuleLoader } from './module-loader';

function isStaticAssetRequest(url: string): boolean {
  return (
    url.endsWith('.css') ||
    url.endsWith('.js') ||
    url.endsWith('.mjs') ||
    url.endsWith('.ts') ||
    url.endsWith('.png') ||
    url.endsWith('.jpg') ||
    url.endsWith('.jpeg') ||
    url.endsWith('.gif') ||
    url.endsWith('.svg') ||
    url.endsWith('.webp') ||
    url.endsWith('.ico') ||
    url.endsWith('.woff') ||
    url.endsWith('.woff2') ||
    url.endsWith('.ttf') ||
    url.endsWith('.otf')
  );
}

function normalizeRoutePath(input: string): string {
  let value = input.split('?')[0].split('#')[0];

  if (!value.startsWith('/')) value = '/' + value;
  value = value.replace(/\/+/g, '/');

  if (value.length > 1 && value.endsWith('/')) {
    value = value.slice(0, -1);
  }

  return value;
}

function shouldSkipHtmlRouting(url: string, pagesDir: string): boolean {
  return (
    url.startsWith('/@vite') ||
    url.startsWith('/@fs/') ||
    url.startsWith('/node_modules/') ||
    url.startsWith(`/${pagesDir}/`) ||
    url === '/favicon.ico' ||
    isStaticAssetRequest(url)
  );
}

function tryRewriteRootAssetToSrc(
  root: string,
  pagesDir: string,
  url: string,
): string | null {
  if (!url.startsWith('/')) return null;
  if (!isStaticAssetRequest(url)) return null;
  if (url.startsWith(`/${pagesDir}/`)) return null;

  const candidate = path.join(root, pagesDir, url.slice(1));

  if (fs.existsSync(candidate)) {
    return `/${pagesDir}/${url.slice(1)}`;
  }

  return null;
}

export function installDevServer(args: {
  server: ViteDevServer;
  root: string;
  pagesDir: string;
  getPages: () => Promise<HtPageInfo[]>;
  getEntries?: () => Promise<HtPageInfo[]>;
}) {
  const { server, root, pagesDir, getPages } = args;
  const loadModulePromise = createPageModuleLoader({
    mode: 'dev',
    root,
    server,
  });

  server.middlewares.use(async (req, res, next) => {
    try {
      const originalUrl = req.url ?? '/';
      const url = normalizeRoutePath(originalUrl);

      const rewrittenAssetUrl = tryRewriteRootAssetToSrc(root, pagesDir, url);
      if (rewrittenAssetUrl) {
        req.url = rewrittenAssetUrl + originalUrl.slice(url.length);
        return next();
      }

      if (shouldSkipHtmlRouting(url, pagesDir)) {
        return next();
      }

      const pages = await getPages();
      const page = pages.find(
        (p) => normalizeRoutePath(p.routePath) === url,
      );

      if (!page) {
        return next();
      }

      const loadModule = await loadModulePromise;
      const mod = await loadModule(page.entryPath, page.relativePath);

      if (!mod) {
        return next();
      }

      const html = await renderPage(page, mod, true);
      const transformedHtml = await server.transformIndexHtml(
        url,
        html,
        req.originalUrl,
      );

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(transformedHtml);
    } catch (error) {
      server.config.logger.error(
        `[${PLUGIN_NAME}] dev server render failed: ${
          error instanceof Error ? error.stack ?? error.message : String(error)
        }`,
      );

      next(error as Error);
    }
  });
}