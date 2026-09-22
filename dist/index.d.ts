import { Plugin } from 'vite';
import { HtPagesPluginOptions } from './types.js';
export { HtPageInfo, HtPageModule, HtPageRenderContext, StaticParamRecord } from './types.js';

declare function htPages(options?: HtPagesPluginOptions): Plugin;

type FetchCacheMode = 'auto' | 'memory' | 'fs' | 'none';
interface FetchWithCacheOptions {
    maxAge?: number;
    cacheKey?: string;
    forceRefresh?: boolean;
    cache?: FetchCacheMode;
}
declare function fetchWithCache(input: RequestInfo | URL, init?: RequestInit, options?: FetchWithCacheOptions): Promise<Response>;

export { type FetchWithCacheOptions, HtPagesPluginOptions, htPages as default, fetchWithCache };
