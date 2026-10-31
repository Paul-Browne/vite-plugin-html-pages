import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import type { Connect, ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';

import { renderPage } from './render-runtime.js';
import { defaultNotFoundHtml } from './not-found-page.js';
import { matchDynamicPage, NOT_FOUND_ROUTE } from './route-utils.js';
import type { HtPageInfo, HtPagesPluginOptions } from './types.js';
import { brand } from './brand.js';
import { createPageModuleLoader } from './module-loader.js';
import {
  buildDevToolbarInfo,
  injectDevToolbar,
  resolveDevToolbarEnabled,
} from './dev-toolbar.js';

const PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'),
    'utf8',
  ),
).version as string;

function isStaticAssetRequest(url: string): boolean {
  return (
    url.endsWith('.css') ||
    url.endsWith('.js') ||
    url.endsWith('.mjs') ||
    url.endsWith('.jsx') ||
    url.endsWith('.ts') ||
    url.endsWith('.mts') ||
    url.endsWith('.tsx') ||
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

/**
 * The request with Vite's base taken off, or `null` when it is outside
 * the base.
 *
 * This middleware runs before Vite's own base middleware, so it sees
 * the base still on. Pages and assets live under the base, as they do
 * once `dist/` is deployed; a URL outside it is Vite's to answer, which
 * it does by redirecting `/` to the base and pointing anything else at
 * it. In middleware mode Vite lets such a URL through untouched, and so
 * does this.
 */
function stripDevBase(
  url: string,
  base: string,
  middlewareMode: boolean,
): { url: string; base: string } | null {
  if (base === '/' || url.startsWith(base)) {
    return { url: `/${url.slice(base.length)}`, base };
  }

  return middlewareMode ? { url, base: '/' } : null;
}

function shouldSkipHtmlRouting(url: string, pagesDir: string): boolean {
  return (
    url.startsWith('/@vite') ||
    url.startsWith('/@fs/') ||
    url.startsWith('/@id/') ||
    url.startsWith('/node_modules/') ||
    url.startsWith(`/${pagesDir}/`) ||
    url === '/favicon.ico' ||
    isStaticAssetRequest(url)
  );
}

function hasDotDotSegment(url: string): boolean {
  return url.split('/').includes('..');
}

function tryRewriteRootAssetToSrc(
  root: string,
  pagesDir: string,
  url: string,
): string | null {
  if (!url.startsWith('/')) return null;
  if (hasDotDotSegment(url)) return null;
  if (!isStaticAssetRequest(url)) return null;
  if (url.startsWith(`/${pagesDir}/`)) return null;

  const candidate = path.join(root, pagesDir, url.slice(1));

  if (fs.existsSync(candidate)) {
    return `/${pagesDir}/${url.slice(1)}`;
  }

  return null;
}

function rewriteRootAssetUrlsInDevHtml(
  html: string,
  root: string,
  pagesDir: string,
): string {
  return html.replace(
    /\b(href|src)=["'](\/[^"']+)["']/g,
    (full, attr: string, url: string) => {
      if (hasDotDotSegment(url)) return full;
      if (!isStaticAssetRequest(url)) return full;
      if (url.startsWith(`/${pagesDir}/`)) return full;

      const candidate = path.join(root, pagesDir, url.slice(1));

      if (!fs.existsSync(candidate)) return full;

      return `${attr}="/${pagesDir}/${url.slice(1)}"`;
    },
  );
}

/**
 * Whether Vite's html middleware, which runs after the 404 below, will
 * serve this request. Vite's html fallback has pointed it at an `.html`
 * file under Vite's root if there is one: an `index.html` beside the
 * pages, say.
 */
function isViteHtmlFile(url: string | undefined, viteRoot: string): boolean {
  const pathname = (url ?? '').split('?')[0].split('#')[0];

  if (!pathname.endsWith('.html')) return false;

  try {
    return fs.existsSync(path.join(viteRoot, decodeURIComponent(pathname)));
  } catch {
    return false;
  }
}

function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

/**
 * Serve pages from the dev server.
 *
 * Returns the hook that answers a URL with no page behind it, for the
 * plugin's `configureServer` to hand back to Vite, which runs it after
 * its own middlewares: a miss is only a miss once Vite has had its turn
 * at `public/` and the rest.
 */
export function installDevServer(args: {
  server: ViteDevServer;
  root: string;
  pagesDir: string;
  options: HtPagesPluginOptions;
  getPages: () => Promise<HtPageInfo[]>;
  getEntries?: () => Promise<HtPageInfo[]>;
}): () => void {
  const { server, root, pagesDir, options, getPages, getEntries } = args;
  const toolbarEnabled = resolveDevToolbarEnabled(options);
  const loaderPromise = createPageModuleLoader({
    mode: 'dev',
    root,
    server,
  });

  // Requests no page matched, by their route path.
  const misses = new WeakMap<Connect.IncomingMessage, string>();

  /** A page as the dev server serves it, or `null` if its module did not load. */
  async function renderDevHtml(
    page: HtPageInfo,
    url: string,
    req: Connect.IncomingMessage,
  ): Promise<string | null> {
    const { loadModule } = await loaderPromise;
    const mod = await loadModule(page.entryPath, page.relativePath);

    if (!mod) return null;

    const html = await renderPage(page, mod, true);

    const devHtml = rewriteRootAssetUrlsInDevHtml(
      html,
      root,
      pagesDir,
    );

    let transformedHtml = await server.transformIndexHtml(
      url,
      devHtml,
      req.originalUrl,
    );

    if (toolbarEnabled) {
      transformedHtml = injectDevToolbar(
        transformedHtml,
        buildDevToolbarInfo({
          page,
          options,
          pluginVersion: PLUGIN_VERSION,
        }),
      );
    }

    return transformedHtml;
  }

  function renderFailed(error: unknown, next: Connect.NextFunction): void {
    server.config.logger.error(
      brand(
        `dev server render failed: ${
          error instanceof Error ? error.stack ?? error.message : String(error)
        }`,
      ),
    );

    next(error as Error);
  }

  server.middlewares.use(async (req, res, next) => {
    try {
      const request = stripDevBase(
        req.url ?? '/',
        server.config.base,
        !!server.config.server.middlewareMode,
      );

      if (!request) return next();

      const originalUrl = request.url;
      const url = normalizeRoutePath(originalUrl);

      const rewrittenAssetUrl = tryRewriteRootAssetToSrc(root, pagesDir, url);
      if (rewrittenAssetUrl) {
        // Re-append the query/hash from the original URL; slicing by the
        // normalized path length is wrong when normalization collapsed
        // slashes or stripped a trailing slash.
        const suffixIndex = originalUrl.search(/[?#]/);
        const suffix = suffixIndex === -1 ? '' : originalUrl.slice(suffixIndex);

        // Back under the base, for Vite's base middleware to take off.
        req.url = request.base + rewrittenAssetUrl.slice(1) + suffix;
        return next();
      }

      if (shouldSkipHtmlRouting(url, pagesDir)) {
        return next();
      }

      const pages = await getPages();

      // Exact matches (static pages and routes pre-listed by
      // generateStaticParams) take precedence.
      let page = pages.find(
        (p) => normalizeRoutePath(p.routePath) === url,
      );

      // Fall back to matching dynamic route patterns so pages like
      // blog/[slug].ht.js render on demand in dev, even for params not
      // listed by generateStaticParams.
      if (!page && getEntries) {
        page = matchDynamicPage(await getEntries(), url) ?? undefined;
      }

      if (!page) {
        misses.set(req, url);
        return next();
      }

      const html = await renderDevHtml(page, url, req);

      if (html === null) {
        return next();
      }

      sendHtml(res, 200, html);
    } catch (error) {
      renderFailed(error, next);
    }
  });

  return () => {
    // Vite ends a miss with an empty 404 only for these app types; with
    // `custom`, it falls through to whatever server the dev server is
    // mounted in, and stays that server's to answer.
    const { appType } = server.config;
    if (appType !== 'spa' && appType !== 'mpa') return;

    server.middlewares.use(async (req, res, next) => {
      const url = misses.get(req);

      if (url === undefined || isViteHtmlFile(req.url, server.config.root)) {
        return next();
      }

      try {
        // What the build writes to 404.html, and a static host serves
        // for a miss: the site's own 404 page, or the default.
        const notFoundPage = (await getPages()).find(
          (p) => p.routePath === NOT_FOUND_ROUTE,
        );

        const html =
          (notFoundPage && (await renderDevHtml(notFoundPage, url, req))) ??
          (await server.transformIndexHtml(
            url,
            defaultNotFoundHtml(server.config.base),
            req.originalUrl,
          ));

        sendHtml(res, 404, html);
      } catch (error) {
        renderFailed(error, next);
      }
    });
  };
}
