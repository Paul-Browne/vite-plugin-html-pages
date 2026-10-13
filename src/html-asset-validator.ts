import fs from 'node:fs';
import path from 'node:path';

import { stripBase } from './base-url.js';

export interface HtmlAssetValidationOptions {
  root: string;
  pagesDir: string;
  html: string;
  pluginName: string;
  pageLabel?: string;
  missingAssets?: 'error' | 'warn';
  externalAssets?: string | string[];
  /**
   * The base the page's URLs were written with — Vite's `base`, or for a
   * relative base the page's path back to the output root. It comes off
   * a URL before the URL is looked up on disk or matched against
   * `externalAssets`, both of which are written for the site root.
   * Defaults to `/`.
   */
  base?: string;
}

function stripQueryAndHash(url: string): string {
  return url.split('#')[0].split('?')[0];
}

function isLocalRootUrl(url: string): boolean {
  return !!url && url.startsWith('/') && !url.startsWith('//');
}

/**
 * URLs another plugin serves, which therefore have no file on disk here.
 *
 * A trailing slash makes an entry a directory prefix (`/su/` covers
 * `/su/alert.js`); anything else has to match the URL exactly, so `/su`
 * never quietly swallows `/super.js`.
 */
function matchesExternalAsset(url: string, patterns: string[]): boolean {
  const clean = stripQueryAndHash(url);

  return patterns.some((pattern) =>
    pattern.endsWith('/') ? clean.startsWith(pattern) : clean === pattern,
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

function fileExistsForPublicUrl(root: string, pagesDir: string, url: string): boolean {
  const clean = stripQueryAndHash(url).slice(1);

  const fromSrc = path.join(root, pagesDir, clean);
  if (fs.existsSync(fromSrc)) return true;

  const fromPublic = path.join(root, 'public', clean);
  if (fs.existsSync(fromPublic)) return true;

  return false;
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

/** Drop documentation samples so example `import('/…')` strings aren't treated as assets. */
function stripCodeSampleMarkup(html: string): string {
  return html
    .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, '')
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, '');
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
 * Collects every root-relative URL the HTML references (any href/src
 * attribute plus literal dynamic imports), with `base` taken off and
 * query/hash stripped. Used to decide which source assets must be
 * emitted at build time.
 */
export function collectLocalAssetUrls(html: string, base = '/'): string[] {
  const candidates = [
    ...collectHrefSrcUrls(html),
    ...collectLiteralDynamicImports(html),
  ];

  return unique(
    candidates
      .map((url) => stripBase(url, base))
      .filter(isLocalRootUrl)
      .map(stripQueryAndHash),
  );
}

function formatPageLabel(pageLabel?: string): string {
  return pageLabel ? ` (${pageLabel})` : '';
}

type MissingAsset = {
  pluginName: string;
  kind: string;
  /** As the page has it. */
  url: string;
  /** What it stands for at the site root, with the base taken off. */
  sitePath: string;
  base: string;
  root: string;
  pagesDir: string;
  pageLabel?: string;
};

function missingAssetMessage(args: MissingAsset): string {
  const { pluginName, kind, url, sitePath, base, root, pagesDir, pageLabel } = args;
  const clean = stripQueryAndHash(sitePath).slice(1);
  const pageSuffix = formatPageLabel(pageLabel);

  const message =
    `[${pluginName}] Missing ${kind}${pageSuffix}: ${url}\n` +
    `Expected one of:\n` +
    `- ${path.join(root, pagesDir, clean)}\n` +
    `- ${path.join(root, 'public', clean)}`;

  // The base twice over is a page that wrote it in by hand, on a URL
  // the build — like the dev server — puts it on anyway.
  const once = stripBase(sitePath, base);

  if (once === sitePath || !fileExistsForPublicUrl(root, pagesDir, once)) {
    return message;
  }

  return (
    `${message}\n` +
    `It has Vite's base (${base}) twice: page HTML is written for the site ` +
    `root, and the base is added to asset URLs for you, in dev and build ` +
    `alike. Write "${once}".`
  );
}

function reportMissing(mode: 'error' | 'warn', asset: MissingAsset) {
  const message = missingAssetMessage(asset);

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
   * Both lookups are laid out for the site root, so the base comes off
   * a URL first.
   */
  const external = normalizeExternalAssets(externalAssets);
  const checkable = (urls: string[]) =>
    unique(urls)
      .map((url) => ({ url, sitePath: stripBase(url, base) }))
      .filter(
        ({ sitePath }) =>
          isLocalRootUrl(sitePath) && !matchesExternalAsset(sitePath, external),
      );

  const describe = (kind: string, url: string, sitePath: string): MissingAsset => ({
    pluginName,
    kind,
    url,
    sitePath,
    base,
    root,
    pagesDir,
    pageLabel,
  });

  for (const { url, sitePath } of checkable(collectScriptSrcs(html))) {
    if (!fileExistsForPublicUrl(root, pagesDir, sitePath)) {
      reportMissing(missingAssets, describe('JavaScript asset', url, sitePath));
    }
  }

  for (const { url, sitePath } of checkable(collectStylesheetHrefs(html))) {
    if (!fileExistsForPublicUrl(root, pagesDir, sitePath)) {
      reportMissing(missingAssets, describe('stylesheet asset', url, sitePath));
    }
  }

  for (const { url, sitePath } of checkable(collectLiteralDynamicImports(html))) {
    if (!fileExistsForPublicUrl(root, pagesDir, sitePath)) {
      console.warn(
        `⚠️ ${missingAssetMessage(describe('literal dynamic import', url, sitePath))}`,
      );
    }
  }
}
