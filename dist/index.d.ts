import { Plugin as Plugin$1 } from 'vite';
import { Plugin } from 'rollup';

interface StaticParamRecord {
    [key: string]: string | number | boolean;
}
interface HtPageInfo {
    id: string;
    entryPath: string;
    absolutePath: string;
    relativePath: string;
    routePattern: string;
    routePath: string;
    fileName: string;
    dynamic: boolean;
    paramNames: string[];
    params: Record<string, string>;
}
interface HtPageRenderContext {
    page: HtPageInfo;
    params: Record<string, string>;
    data?: unknown;
    dev: boolean;
}
interface HtPageModule {
    default?: string | ((ctx: HtPageRenderContext) => string | Promise<string>);
    data?: (ctx: HtPageRenderContext) => unknown | Promise<unknown>;
    generateStaticParams?: () => StaticParamRecord[] | Promise<StaticParamRecord[]>;
    dynamic?: boolean;
    prerender?: boolean;
}
interface HtPagesPluginOptions {
    root?: string;
    include?: string | string[];
    exclude?: string | string[];
    pagesDir?: string;
    renderConcurrency?: number;
    renderBatchSize?: number;
    cleanUrls?: boolean;
    ssrPlugins?: Plugin[];
    mapOutputPath?: (page: HtPageInfo) => string;
    debug?: boolean;
    site?: string;
    rss?: {
        site: string;
        title?: string;
        description?: string;
        routePrefix?: string;
    };
}

declare function htPages(options?: HtPagesPluginOptions): Plugin$1;

type FetchCacheMode = 'auto' | 'memory' | 'fs' | 'none';
interface FetchAndCacheOptions {
    maxAge?: number;
    cacheKey?: string;
    forceRefresh?: boolean;
    cache?: FetchCacheMode;
}
declare function fetchAndCache(input: RequestInfo | URL, init?: RequestInit, options?: FetchAndCacheOptions): Promise<Response>;

export { type FetchAndCacheOptions, type HtPageInfo, type HtPageModule, type HtPageRenderContext, type HtPagesPluginOptions, type StaticParamRecord, fetchAndCache, htPages };
