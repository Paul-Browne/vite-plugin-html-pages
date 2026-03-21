import fs from 'node:fs';
import path from 'node:path';
import type {
  OutputBundle,
  PluginContext,
} from 'rollup';

export type HtmlAssetKind = 'css' | 'js';

export interface HtmlAssetRef {
  kind: HtmlAssetKind;
  originalUrl: string;
  absolutePath: string;
  refId: string;
}

export interface ExtractedHtmlAsset {
  kind: HtmlAssetKind;
  url: string;
}

const EXTERNAL_URL_RE = /^(?:[a-z]+:)?\/\//i;

export function isLocalAssetUrl(url: string): boolean {
  return (
    !!url &&
    !url.startsWith('data:') &&
    !url.startsWith('mailto:') &&
    !url.startsWith('tel:') &&
    !url.startsWith('#') &&
    !EXTERNAL_URL_RE.test(url)
  );
}

export function stripQueryAndHash(url: string): string {
  return url.split('#')[0].split('?')[0];
}

export function extractHtmlAssets(html: string): ExtractedHtmlAsset[] {
  const assets: ExtractedHtmlAsset[] = [];

  for (const match of html.matchAll(
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  )) {
    assets.push({ kind: 'css', url: match[1] });
  }

  for (const match of html.matchAll(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
  )) {
    assets.push({ kind: 'js', url: match[1] });
  }

  return dedupeExtractedAssets(assets);
}

function dedupeExtractedAssets(
  assets: ExtractedHtmlAsset[],
): ExtractedHtmlAsset[] {
  const seen = new Set<string>();
  const out: ExtractedHtmlAsset[] = [];

  for (const asset of assets) {
    const key = `${asset.kind}:${asset.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }

  return out;
}

export function resolveLocalAssetPath(args: {
  root: string;
  pagesDir: string;
  pageDir?: string;
  url: string;
}): string | null {
  const { root, pagesDir, pageDir, url } = args;

  if (!isLocalAssetUrl(url)) return null;

  const cleanUrl = stripQueryAndHash(url);

  let abs: string;

  if (cleanUrl.startsWith('/')) {
    abs = path.join(root, pagesDir, cleanUrl.slice(1));
  } else if (cleanUrl.startsWith(`${pagesDir}/`)) {
    abs = path.join(root, cleanUrl);
  } else {
    const baseDir = pageDir ?? path.join(root, pagesDir);
    abs = path.resolve(baseDir, cleanUrl);
  }

  return fs.existsSync(abs) ? abs : null;
}

export function emitHtmlAsset(args: {
  ctx: PluginContext;
  kind: HtmlAssetKind;
  absolutePath: string;
}): string {
  const { ctx, kind, absolutePath } = args;

  if (kind === 'css' || kind === 'js') {
    return ctx.emitFile({
      type: 'chunk',
      id: absolutePath,
      name: path.basename(absolutePath, path.extname(absolutePath)),
    });
  }

  throw new Error(`[vite-plugin-html-pages] Unsupported asset kind: ${kind}`);
}

function replaceAllLiteral(
  input: string,
  search: string,
  replacement: string,
): string {
  return input.split(search).join(replacement);
}

export function rewriteHtmlAssetUrls(
  html: string,
  replacements: Map<string, string>,
): string {
  let out = html;

  for (const [originalUrl, builtUrl] of replacements) {
    out = replaceAllLiteral(
      out,
      `href="${originalUrl}"`,
      `href="${builtUrl}"`,
    );
    out = replaceAllLiteral(
      out,
      `href='${originalUrl}'`,
      `href='${builtUrl}'`,
    );
    out = replaceAllLiteral(
      out,
      `src="${originalUrl}"`,
      `src="${builtUrl}"`,
    );
    out = replaceAllLiteral(
      out,
      `src='${originalUrl}'`,
      `src='${builtUrl}'`,
    );
  }

  return out;
}

export async function collectHtmlAssetRefs(args: {
  ctx: PluginContext;
  root: string;
  pagesDir: string;
  htmlByPageKey: Map<string, { html: string; pageDir?: string }>;
}): Promise<Map<string, HtmlAssetRef>> {
  const { ctx, root, pagesDir, htmlByPageKey } = args;
  const refs = new Map<string, HtmlAssetRef>();

  for (const { html, pageDir } of htmlByPageKey.values()) {
    const assets = extractHtmlAssets(html);

    for (const asset of assets) {
      const abs = resolveLocalAssetPath({
        root,
        pagesDir,
        pageDir,
        url: asset.url,
      });

      if (!abs) continue;

      const key = `${asset.kind}:${asset.url}`;
      if (refs.has(key)) continue;

      const refId = emitHtmlAsset({
        ctx,
        kind: asset.kind,
        absolutePath: abs,
      });

      refs.set(key, {
        kind: asset.kind,
        originalUrl: asset.url,
        absolutePath: abs,
        refId,
      });
    }
  }

  return refs;
}

export function buildHtmlAssetReplacementMap(args: {
  ctx: PluginContext;
  refs: Map<string, HtmlAssetRef>;
  bundle: OutputBundle;
}): Map<string, string> {
  const { ctx, refs, bundle } = args;
  const replacements = new Map<string, string>();

  for (const ref of refs.values()) {
    if (ref.kind === 'js') {
      const fileName = ctx.getFileName(ref.refId);
      replacements.set(ref.originalUrl, `/${fileName}`);
      continue;
    }

    if (ref.kind === 'css') {
      const jsEntryFile = ctx.getFileName(ref.refId);
      const jsChunk = bundle[jsEntryFile];

      if (
        jsChunk &&
        jsChunk.type === 'chunk' &&
        'viteMetadata' in jsChunk &&
        jsChunk.viteMetadata?.importedCss &&
        jsChunk.viteMetadata.importedCss.size > 0
      ) {
        const cssFile = [...jsChunk.viteMetadata.importedCss][0];
        replacements.set(ref.originalUrl, `/${cssFile}`);
        continue;
      }

      replacements.set(ref.originalUrl, `/${jsEntryFile}`);
    }
  }

  return replacements;
}