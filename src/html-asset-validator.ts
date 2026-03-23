import fs from 'node:fs';
import path from 'node:path';

export interface HtmlAssetValidationOptions {
  root: string;
  pagesDir: string;
  html: string;
  pluginName: string;
  pageLabel?: string;
  missingAssets?: 'error' | 'warn';
}

function stripQueryAndHash(url: string): string {
  return url.split('#')[0].split('?')[0];
}

function isLocalRootUrl(url: string): boolean {
  return !!url && url.startsWith('/') && !url.startsWith('//');
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

  for (const match of html.matchAll(
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
  )) {
    out.push(match[1]);
  }

  return out;
}

function collectLiteralDynamicImports(html: string): string[] {
  const out: string[] = [];

  for (const match of html.matchAll(
    /import\s*\(\s*["']([^"'`]+)["']\s*\)/gi,
  )) {
    out.push(match[1]);
  }

  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function formatPageLabel(pageLabel?: string): string {
  return pageLabel ? ` (${pageLabel})` : '';
}

function missingAssetMessage(args: {
  pluginName: string;
  kind: string;
  url: string;
  root: string;
  pagesDir: string;
  pageLabel?: string;
}): string {
  const { pluginName, kind, url, root, pagesDir, pageLabel } = args;
  const clean = stripQueryAndHash(url).slice(1);
  const pageSuffix = formatPageLabel(pageLabel);

  return (
    `[${pluginName}] Missing ${kind}${pageSuffix}: ${url}\n` +
    `Expected one of:\n` +
    `- ${path.join(root, pagesDir, clean)}\n` +
    `- ${path.join(root, 'public', clean)}`
  );
}

function reportMissing(args: {
  mode: 'error' | 'warn';
  pluginName: string;
  kind: string;
  url: string;
  root: string;
  pagesDir: string;
  pageLabel?: string;
}) {
  const message = missingAssetMessage(args);

  if (args.mode === 'warn') {
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
  } = options;

  const scriptSrcs = unique(collectScriptSrcs(html)).filter(isLocalRootUrl);
  const stylesheetHrefs = unique(collectStylesheetHrefs(html)).filter(isLocalRootUrl);
  const literalDynamicImports = unique(collectLiteralDynamicImports(html)).filter(
    isLocalRootUrl,
  );

  for (const url of scriptSrcs) {
    if (!fileExistsForPublicUrl(root, pagesDir, url)) {
      reportMissing({
        mode: missingAssets,
        pluginName,
        kind: 'JavaScript asset',
        url,
        root,
        pagesDir,
        pageLabel,
      });
    }
  }

  for (const url of stylesheetHrefs) {
    if (!fileExistsForPublicUrl(root, pagesDir, url)) {
      reportMissing({
        mode: missingAssets,
        pluginName,
        kind: 'stylesheet asset',
        url,
        root,
        pagesDir,
        pageLabel,
      });
    }
  }

  for (const url of literalDynamicImports) {
    if (!fileExistsForPublicUrl(root, pagesDir, url)) {
      console.warn(
        `⚠️ ${missingAssetMessage({
          pluginName,
          kind: 'literal dynamic import',
          url,
          root,
          pagesDir,
          pageLabel,
        })}`,
      );
    }
  }
}