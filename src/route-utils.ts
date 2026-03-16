import { normalizeRoutePath, stripHtSuffix, toPosix } from './path-utils';
import type { HtPageInfo, StaticParamRecord } from './types';
import { PLUGIN_NAME } from './constants';

const DYNAMIC_SEGMENT_RE = /\[([A-Za-z0-9_]+)\]/g;
const CATCH_ALL_SEGMENT_RE = /\[\.\.\.([A-Za-z0-9_]+)\]/g;
const ANY_PARAM_RE = /\[(?:\.\.\.)?([A-Za-z0-9_]+)\]/g;

export function getParamNames(relativeFromPagesDir: string): string[] {
  return [...relativeFromPagesDir.matchAll(ANY_PARAM_RE)].map((m) => m[1]);
}

export function isDynamicPage(relativeFromPagesDir: string): boolean {
  return /\[(?:\.\.\.)?[A-Za-z0-9_]+\]/.test(relativeFromPagesDir);
}

export function toRoutePattern(relativeFromPagesDir: string): string {
  const noExt = stripHtSuffix(toPosix(relativeFromPagesDir));

  const raw = noExt
    .replace(/(^|\/)index$/i, '$1')
    .replace(CATCH_ALL_SEGMENT_RE, '*:$1')
    .replace(DYNAMIC_SEGMENT_RE, ':$1');

  return normalizeRoutePath(raw || '/');
}

export function fillParams(
  pattern: string,
  params: Record<string, string>,
): string {
  return pattern
    .replace(/\*:([A-Za-z0-9_]+)/g, (_, key) => {
      if (!(key in params)) {
        throw new Error(`[${PLUGIN_NAME}] Missing catch-all route param "${key}"`);
      }

      return String(params[key])
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');
    })
    .replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      if (!(key in params)) {
        throw new Error(`[${PLUGIN_NAME}] Missing route param "${key}"`);
      }

      return encodeURIComponent(params[key]);
    });
}

export function fileNameFromRoute(
  routePath: string,
  cleanUrls: boolean,
): string {
  const normalized = normalizeRoutePath(routePath);

  if (normalized === '/') return 'index.html';

  const base = normalized.slice(1);
  return cleanUrls ? `${base}/index.html` : `${base}.html`;
}

export function expandStaticPaths(
  basePage: Omit<HtPageInfo, 'routePath' | 'fileName' | 'params'>,
  rows: StaticParamRecord[],
  cleanUrls: boolean,
): HtPageInfo[] {
  return rows.map((row) => {
    const params = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, String(v)]),
    );

    const routePath = fillParams(basePage.routePattern, params);

    return {
      ...basePage,
      routePath,
      fileName: fileNameFromRoute(routePath, cleanUrls),
      params,
    };
  });
}

export function routeMatch(
  pattern: string,
  urlPath: string,
): Record<string, string> | null {
  const a = normalizeRoutePath(pattern).split('/').filter(Boolean);
  const b = normalizeRoutePath(urlPath).split('/').filter(Boolean);
  const params: Record<string, string> = {};

  for (let i = 0, j = 0; i < a.length; i++, j++) {
    const seg = a[i];

    if (seg.startsWith('*:')) {
      const rest = b.slice(j);

      if (rest.length === 0) {
        return null;
      }

      params[seg.slice(2)] = rest.map(decodeURIComponent).join('/');
      return params;
    }

    if (j >= b.length) return null;

    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(b[j]);
      continue;
    }

    if (seg !== b[j]) return null;
  }

  return a.length === b.length ? params : null;
}

export function compareRoutePriority(a: string, b: string): number {
  const aSegs = normalizeRoutePath(a).split('/').filter(Boolean);
  const bSegs = normalizeRoutePath(b).split('/').filter(Boolean);
  const len = Math.max(aSegs.length, bSegs.length);

  for (let i = 0; i < len; i++) {
    const aa = aSegs[i];
    const bb = bSegs[i];

    if (aa == null) return 1;
    if (bb == null) return -1;

    const aCatchAll = aa.startsWith('*:');
    const bCatchAll = bb.startsWith('*:');
    if (aCatchAll !== bCatchAll) return aCatchAll ? 1 : -1;

    const aDynamic = aa.startsWith(':');
    const bDynamic = bb.startsWith(':');
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;
  }

  return 0;
}