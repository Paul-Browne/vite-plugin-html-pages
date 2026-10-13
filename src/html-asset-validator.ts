import fs from 'node:fs';
import path from 'node:path';

import {
  COMMONJS_EXTENSIONS,
  COMPILED_TO_JS_EXTENSIONS,
} from './static-assets.js';

export interface HtmlAssetValidationOptions {
  root: string;
  pagesDir: string;
  html: string;
  pluginName: string;
  pageLabel?: string;
  /**
   * Where the page is emitted, relative to the output directory
   * (`blog/hello/index.html`). Relative URLs resolve against it, as they
   * do in the browser. Defaults to `index.html`.
   */
  pageFileName?: string;
  missingAssets?: 'error' | 'warn';
  externalAssets?: string | string[];
  /**
   * Vite's `base`. The site is served from there, so a URL under it is
   * one of the site's own files, laid out from the root of `pagesDir`
   * and `public/`; the base comes off before the file is looked for or
   * matched against `externalAssets`. Defaults to `/`.
   */
  base?: string;
}

/** Neither root-relative nor carrying a scheme: resolved against the page. */
function isRelativeUrl(url: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(url);
}

/** Stands in for the site's own origin, so pages' URLs can be resolved. */
const SITE_ORIGIN = 'http://html-pages.invalid';
const SITE_ROOT = new URL(`${SITE_ORIGIN}/`);

/**
 * Where the site is served from: Vite's `base`, on the stand-in origin
 * unless it names its own. A relative base moves with the pages, which
 * are laid out from the output root either way.
 */
function siteRootUrl(base = '/'): URL {
  if (!base || base.startsWith('.')) return SITE_ROOT;

  try {
    return new URL(base.endsWith('/') ? base : `${base}/`, SITE_ROOT);
  } catch {
    return SITE_ROOT;
  }
}

/**
 * What relative URLs in `html` resolve against: the page's own location
 * under the site root, unless a `<base href>` says otherwise.
 */
function documentBaseUrl(html: string, pageFileName: string, siteRoot: URL): URL {
  const page = new URL(pageFileName.replace(/^\/+/, ''), siteRoot);
  const base = stripCodeSampleMarkup(html).match(
    /<base\b[^>]*\bhref=["']([^"']+)["']/i,
  );

  if (!base) return page;

  try {
    return new URL(base[1], page);
  } catch {
    return page;
  }
}

/**
 * Resolves `url` the way the browser would and returns its decoded path
 * from the site root, or `null` when it leaves the site (another origin,
 * `data:`, `mailto:`) or only points back at the page itself (`#top`,
 * `?q=1`).
 *
 * Under the base, the base comes off: `/repo/site.css` is `/site.css`.
 * A path elsewhere on the origin — one the page wrote without the base,
 * or marked `vite-ignore` — is read as written.
 */
function resolveLocalPath(url: string, documentBase: URL, siteRoot: URL): string | null {
  if (url.startsWith('#') || url.startsWith('?')) return null;

  let resolved: URL;

  try {
    resolved = new URL(url, documentBase);
  } catch {
    return null;
  }

  if (resolved.origin !== siteRoot.origin) return null;

  const pathname = resolved.pathname.startsWith(siteRoot.pathname)
    ? resolved.pathname.slice(siteRoot.pathname.length - 1)
    : resolved.pathname;

  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** Swaps the extension of a URL's path, keeping any query or hash. */
function replaceExtension(url: string, from: string, to: string): string {
  const suffixIndex = url.search(/[?#]/);
  const pathPart = suffixIndex === -1 ? url : url.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : url.slice(suffixIndex);

  if (!pathPart.endsWith(from)) return url;

  return pathPart.slice(0, -from.length) + to + suffix;
}

/**
 * URLs another plugin serves, which therefore have no file on disk here.
 *
 * A trailing slash makes an entry a directory prefix (`/su/` covers
 * `/su/alert.js`); anything else has to match the URL exactly, so `/su`
 * never quietly swallows `/super.js`.
 */
function matchesExternalAsset(urlPath: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('/') ? urlPath.startsWith(pattern) : urlPath === pattern,
  );
}

function normalizeExternalAssets(value?: string | string[]): string[] {
  const list = value == null ? [] : Array.isArray(value) ? value : [value];

  // Root-relative is the only thing a page can reference this way, so a
  // caller who left the slash off meant the same thing.
  return list
    .filter(Boolean)
    .map((entry) => (entry.startsWith('/') ? entry : `/${entry}`));
}

function fileExistsForPublicPath(root: string, pagesDir: string, urlPath: string): boolean {
  const clean = urlPath.slice(1);

  const fromSrc = path.join(root, pagesDir, clean);
  if (fs.existsSync(fromSrc)) return true;

  const fromPublic = path.join(root, 'public', clean);
  if (fs.existsSync(fromPublic)) return true;

  return false;
}

/**
 * A CommonJS source under `pagesDir` that the page expects to ship. The
 * build never emits one, so unless `public/` has a copy, the page would
 * point at nothing.
 */
function isUnshippedCommonJs(root: string, pagesDir: string, urlPath: string): boolean {
  if (!COMMONJS_EXTENSIONS.includes(path.posix.extname(urlPath))) return false;

  const clean = urlPath.slice(1);

  return (
    fs.existsSync(path.join(root, pagesDir, clean)) &&
    !fs.existsSync(path.join(root, 'public', clean))
  );
}

function collectScriptSrcs(html: string): string[] {
  const out: string[] = [];

  for (const match of html.matchAll(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  )) {
    out.push(match[1]);
  }

  return out;
}

function collectStylesheetHrefs(html: string): string[] {
  const out: string[] = [];

  // Match attributes independently so <link href=".." rel="stylesheet">
  // is detected regardless of attribute order.
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];

    if (!/\brel=["']?stylesheet["']?/i.test(tag)) continue;

    const href = tag.match(/\bhref=["']([^"']+)["']/i);

    if (href) out.push(href[1]);
  }

  return out;
}

const CODE_SAMPLE_RE = /<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Drop documentation samples so example `import('/…')` strings aren't treated as assets. */
function stripCodeSampleMarkup(html: string): string {
  return html.replace(CODE_SAMPLE_RE, '');
}

/** Applies `map` to everything except `<pre>` and `<code>` samples. */
function mapOutsideCodeSamples(html: string, map: (chunk: string) => string): string {
  let out = '';
  let last = 0;

  for (const match of html.matchAll(CODE_SAMPLE_RE)) {
    out += map(html.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }

  return out + map(html.slice(last));
}

function collectLiteralDynamicImports(html: string): string[] {
  const out: string[] = [];
  const withoutSamples = stripCodeSampleMarkup(html);

  for (const match of withoutSamples.matchAll(
    /import\s*\(\s*["']([^"'`]+)["']\s*\)/gi,
  )) {
    out.push(match[1]);
  }

  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function collectHrefSrcUrls(html: string): string[] {
  const out: string[] = [];

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    out.push(match[1]);
  }

  return out;
}

/**
 * Collects the path of every same-site URL the HTML references (any
 * href/src attribute plus literal dynamic imports), with query/hash
 * stripped. Relative URLs are resolved against `pageFileName`, and
 * Vite's `base` comes off. Used to decide which source assets must be
 * emitted at build time.
 */
export function collectLocalAssetUrls(
  html: string,
  pageFileName = 'index.html',
  base = '/',
): string[] {
  const siteRoot = siteRootUrl(base);
  const documentBase = documentBaseUrl(html, pageFileName, siteRoot);
  const candidates = [
    ...collectHrefSrcUrls(html),
    ...collectLiteralDynamicImports(html),
  ];

  return unique(
    candidates
      .map((url) => resolveLocalPath(url, documentBase, siteRoot))
      .filter((urlPath): urlPath is string => urlPath !== null),
  );
}

/**
 * Points references to compiled sources at what the build emitted for
 * them, so `src="/main.ts"` becomes `src="/main.js"`. `outputPaths` maps
 * a source path (`/main.ts`) to its output path (`/main.js`).
 *
 * Covers the same references `collectLocalAssetUrls` reads, except in
 * `<pre>`/`<code>` samples, which should go on showing the source name.
 * Only the extension changes, so a relative URL stays relative and a
 * query or hash is kept.
 */
export function rewriteCompiledAssetUrls(
  html: string,
  pageFileName: string,
  outputPaths: Map<string, string>,
  base = '/',
): string {
  if (outputPaths.size === 0) return html;

  const siteRoot = siteRootUrl(base);
  const documentBase = documentBaseUrl(html, pageFileName, siteRoot);

  const rewrite = (url: string): string => {
    const source = resolveLocalPath(url, documentBase, siteRoot);
    const output = source && outputPaths.get(source);

    if (!source || !output) return url;

    return replaceExtension(
      url,
      path.posix.extname(source),
      path.posix.extname(output),
    );
  };

  return mapOutsideCodeSamples(html, (chunk) =>
    chunk
      .replace(
        /\b(href|src)=(["'])([^"']+)\2/gi,
        (_, attr: string, quote: string, url: string) =>
          `${attr}=${quote}${rewrite(url)}${quote}`,
      )
      .replace(
        /(import\s*\(\s*["'])([^"'`]+)(["']\s*\))/gi,
        (_, open: string, url: string, close: string) =>
          `${open}${rewrite(url)}${close}`,
      ),
  );
}

function formatPageLabel(pageLabel?: string): string {
  return pageLabel ? ` (${pageLabel})` : '';
}

/**
 * A likelier URL, when the one given is a near miss: Vite's base written
 * in by hand on top of the one the build adds, a relative URL that only
 * works from the site root, or the `.js` a source compiles to.
 */
function suggestAlternative(args: {
  url: string;
  resolved: string;
  siteRoot: URL;
  root: string;
  pagesDir: string;
}): string | null {
  const { url, resolved, siteRoot, root, pagesDir } = args;
  const basePath = siteRoot.pathname;

  if (basePath !== '/' && resolved.startsWith(basePath)) {
    const once = resolved.slice(basePath.length - 1);

    if (fileExistsForPublicPath(root, pagesDir, once)) {
      return (
        `It has Vite's base (${basePath}) twice: page HTML is written for ` +
        `the site root, and the base is added to asset URLs for you, in dev ` +
        `and build alike. Write "${once}".`
      );
    }
  }

  if (isRelativeUrl(url)) {
    const fromRoot = resolveLocalPath(url, SITE_ROOT, SITE_ROOT);

    if (fromRoot && fileExistsForPublicPath(root, pagesDir, fromRoot)) {
      return (
        `Did you mean "${fromRoot}"? A relative URL resolves against the ` +
        `page's own location, so it changes from page to page.`
      );
    }
  }

  if (resolved.endsWith('.js')) {
    for (const ext of COMPILED_TO_JS_EXTENSIONS) {
      const source = path.join(pagesDir, resolved.slice(1, -3) + ext);

      if (fs.existsSync(path.join(root, source))) {
        return (
          `Did you mean "${replaceExtension(url, '.js', ext)}"? Reference ` +
          `${source} by its source name: the dev server serves it as is, ` +
          `and the build points the page at the .js it compiles to.`
        );
      }
    }
  }

  return null;
}

function missingAssetMessage(args: {
  pluginName: string;
  kind: string;
  url: string;
  resolved: string;
  /** The page's location, from the site root. */
  from: string;
  siteRoot: URL;
  root: string;
  pagesDir: string;
  pageLabel?: string;
}): string {
  const { pluginName, kind, url, resolved, from, siteRoot, root, pagesDir, pageLabel } = args;
  const clean = resolved.slice(1);
  const lines = [`[${pluginName}] Missing ${kind}${formatPageLabel(pageLabel)}: ${url}`];

  if (isRelativeUrl(url)) {
    lines.push(`Resolves to ${resolved} from ${from}`);
  }

  lines.push(
    `Expected one of:`,
    `- ${path.join(root, pagesDir, clean)}`,
    `- ${path.join(root, 'public', clean)}`,
  );

  const alternative = suggestAlternative({ url, resolved, siteRoot, root, pagesDir });

  if (alternative) lines.push(alternative);

  return lines.join('\n');
}

function commonJsMessage(args: {
  pluginName: string;
  kind: string;
  url: string;
  resolved: string;
  pagesDir: string;
  pageLabel?: string;
}): string {
  const { pluginName, kind, url, resolved, pagesDir, pageLabel } = args;
  const source = path.posix.join(pagesDir, resolved.slice(1));

  return [
    `[${pluginName}] Missing ${kind}${formatPageLabel(pageLabel)}: ${url}`,
    `${source} is CommonJS, which browsers can't load, so the build never emits it.`,
    `Write it as an ES module (.js, .mjs, .ts, .mts), or put a file meant to ship as is in public/.`,
  ].join('\n');
}

function reportMissing(mode: 'error' | 'warn', message: string) {
  if (mode === 'warn') {
    console.warn(`⚠️ ${message}`);
    return;
  }

  throw new Error(message);
}

export function validateHtmlAssetReferences(
  options: HtmlAssetValidationOptions,
): void {
  const {
    root,
    pagesDir,
    html,
    pluginName,
    pageLabel,
    pageFileName = 'index.html',
    missingAssets = 'error',
    externalAssets,
    base = '/',
  } = options;

  /*
   * An asset another plugin serves has no file under `pagesDir` or
   * `public/` to find, so checking for one only ever produces a false
   * report. Applied to all three kinds: whatever serves the URL serves
   * it whether a page reached it by `src`, `href`, or `import()`.
   *
   * Both lookups are laid out for the site root, so they get the path
   * with the base already off.
   */
  const external = normalizeExternalAssets(externalAssets);
  const siteRoot = siteRootUrl(base);
  const documentBase = documentBaseUrl(html, pageFileName, siteRoot);
  const from = resolveLocalPath(documentBase.href, documentBase, siteRoot) ?? '/';

  const findMissing = (urls: string[], kind: string): string[] => {
    const messages: string[] = [];

    for (const url of unique(urls)) {
      const resolved = resolveLocalPath(url, documentBase, siteRoot);

      if (resolved === null || matchesExternalAsset(resolved, external)) continue;

      if (isUnshippedCommonJs(root, pagesDir, resolved)) {
        messages.push(
          commonJsMessage({ pluginName, kind, url, resolved, pagesDir, pageLabel }),
        );
        continue;
      }

      if (fileExistsForPublicPath(root, pagesDir, resolved)) continue;

      messages.push(
        missingAssetMessage({
          pluginName,
          kind,
          url,
          resolved,
          from,
          siteRoot,
          root,
          pagesDir,
          pageLabel,
        }),
      );
    }

    return messages;
  };

  for (const message of findMissing(collectScriptSrcs(html), 'JavaScript asset')) {
    reportMissing(missingAssets, message);
  }

  for (const message of findMissing(collectStylesheetHrefs(html), 'stylesheet asset')) {
    reportMissing(missingAssets, message);
  }

  for (const message of findMissing(
    collectLiteralDynamicImports(html),
    'literal dynamic import',
  )) {
    console.warn(`⚠️ ${message}`);
  }
}
