import type { HtPageInfo, HtPageParams, StaticParamRecord } from './types.js';
export declare function getParamNames(relativeFromPagesDir: string): string[];
export declare function isDynamicPage(relativeFromPagesDir: string): boolean;
export declare function toRoutePattern(relativeFromPagesDir: string, extensions: string[]): string;
export declare function fillParams(pattern: string, params: StaticParamRecord): string;
/** `src/404.ht.js`, which hosts serve for any URL that has no page. */
export declare const NOT_FOUND_ROUTE = "/404";
export declare const NOT_FOUND_FILE = "404.html";
export declare function fileNameFromRoute(routePath: string, cleanUrls: boolean): string;
export declare function expandStaticPaths(basePage: Omit<HtPageInfo, 'routePath' | 'fileName' | 'params'>, rows: StaticParamRecord[], cleanUrls: boolean): HtPageInfo[];
export declare function routeMatch(pattern: string, urlPath: string): HtPageParams | null;
/**
 * Matches a URL against the dynamic route patterns of the given entries
 * and returns a completed page info for the best match (static segments
 * beat dynamic ones, dynamic beat catch-alls). Used by the dev server to
 * render dynamic pages on demand, regardless of generateStaticParams.
 */
export declare function matchDynamicPage(entries: HtPageInfo[], urlPath: string): HtPageInfo | null;
export declare function compareRoutePriority(a: string, b: string): number;
