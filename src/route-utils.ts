import { normalizeRoutePath, stripHtSuffix, toPosix } from './path-utils';
import type { HtPageInfo, StaticParamRecord } from './types';

const DYNAMIC_SEGMENT_RE = /\[([A-Za-z0-9_]+)\]/g;
const CATCH_ALL_SEGMENT_RE = /\[\.\.\.([A-Za-z0-9_]+)\]/g;
const OPTIONAL_CATCH_ALL_SEGMENT_RE = /\[\.\.\.([A-Za-z0-9_]+)\]\?/g;
const ANY_PARAM_RE = /\[(?:\.\.\.)?([A-Za-z0-9_]+)\]\??/g;
const ROUTE_GROUP_RE = /(^|\/)\(([^)]+)\)(?=\/|$)/g;

export function getParamNames(relativeFromPagesDir: string): string[] {
  return [...relativeFromPagesDir.matchAll(ANY_PARAM_RE)].map((m) => m[1]);
}

export function isDynamicPage(relativeFromPagesDir: string): boolean {
  return /\[(?:\.\.\.)?[A-Za-z0-9_]+\]\??/.test(relativeFromPagesDir);
}

export function toRoutePattern(relativeFromPagesDir: string): string {
  const noExt = stripHtSuffix(toPosix(relativeFromPagesDir));

  const withoutGroups = noExt.replace(ROUTE_GROUP_RE, '$1');
  const withoutIndex = withoutGroups.replace(/\/index$/i, '').replace(/^index$/i, '');

  const raw = withoutIndex
    .replace(OPTIONAL_CATCH_ALL_SEGMENT_RE, '*?:$1')
    .replace(CATCH_ALL_SEGMENT_RE, '*:$1')
    .replace(DYNAMIC_SEGMENT_RE, ':$1');

  return normalizeRoutePath(raw || '/');
}

export function fillParams(
  pattern: string,
  params: Record<string, string>,
): string {
  const result = pattern
    .replace(/\*\?:([A-Za-z0-9_]+)/g, (_, key) => {
      const value = params[key];
      if (value == null || value === '') {
        return '';
      }

      return String(value)
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');
    })
    .replace(/\*:([A-Za-z0-9_]+)/g, (_, key) => {
      if (!(key in params)) {
        throw new Error(`Missing catch-all route param "${key}"`);
      }

      return String(params[key])
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');
    })
    .replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      if (!(key in params)) {
        throw new Error(`Missing route param "${key}"`);
      }

      return encodeURIComponent(params[key]);
    });

  return normalizeRoutePath(result || '/');
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

  for (let i = 0; i < a.length; i++) {
    const patternSeg = a[i];
    const urlSeg = b[i];

    if (patternSeg.startsWith('*?:')) {
      params[patternSeg.slice(3)] =
        i < b.length ? b.slice(i).map(decodeURIComponent).join('/') : '';
      return params;
    }

    if (patternSeg.startsWith('*:')) {
      const rest = b.slice(i);
      if (rest.length === 0) return null;

      params[patternSeg.slice(2)] = rest.map(decodeURIComponent).join('/');
      return params;
    }

    if (!urlSeg) return null;

    if (patternSeg.startsWith(':')) {
      params[patternSeg.slice(1)] = decodeURIComponent(urlSeg);
      continue;
    }

    if (patternSeg !== urlSeg) return null;
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

    const aOptionalCatchAll = aa.startsWith('*?:');
    const bOptionalCatchAll = bb.startsWith('*?:');
    if (aOptionalCatchAll !== bOptionalCatchAll) {
      return aOptionalCatchAll ? 1 : -1;
    }

    const aCatchAll = aa.startsWith('*:');
    const bCatchAll = bb.startsWith('*:');
    if (aCatchAll !== bCatchAll) {
      return aCatchAll ? 1 : -1;
    }

    const aDynamic = aa.startsWith(':');
    const bDynamic = bb.startsWith(':');
    if (aDynamic !== bDynamic) {
      return aDynamic ? 1 : -1;
    }
  }

  // More specific / longer routes first when otherwise equal
  return bSegs.length - aSegs.length;
}