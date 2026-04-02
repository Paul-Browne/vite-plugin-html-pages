import { Plugin } from 'vite';

type StaticParamPrimitive = string | number | boolean;
type StaticParamValue = StaticParamPrimitive | StaticParamPrimitive[];
interface StaticParamRecord {
    [key: string]: StaticParamValue;
}
type HtPageParamValue = string | string[] | undefined;
type HtPageParams = Record<string, HtPageParamValue>;
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
    paramDefinitions: RouteParamDefinition[];
    params: HtPageParams;
}
type HtPageRenderResult = string | unknown;
type HtPageRenderResultAsync = HtPageRenderResult | Promise<HtPageRenderResult>;
type HtPageRenderContext = {
    page: HtPageInfo;
    params: HtPageParams;
    data?: unknown;
    dev: boolean;
};
interface HtStructuredPageModule<TData = unknown> {
    render: (ctx: {
        page: HtPageInfo;
        params: HtPageParams;
        data?: TData;
        dev: boolean;
    }) => HtPageRenderResultAsync;
    data?: (ctx: {
        page: HtPageInfo;
        params: HtPageParams;
        dev: boolean;
    }) => TData | Promise<TData>;
    generateStaticParams?: () => Array<StaticParamRecord> | Promise<Array<StaticParamRecord>>;
    dynamic?: boolean;
    prerender?: boolean;
}
interface HtPageModule {
    default?: ((ctx: {
        page: HtPageInfo;
        params: HtPageParams;
        data?: unknown;
        dev: boolean;
    }) => HtPageRenderResultAsync) | string | HtStructuredPageModule;
    data?: (ctx: {
        page: HtPageInfo;
        params: HtPageParams;
        dev: boolean;
    }) => unknown | Promise<unknown>;
    generateStaticParams?: () => Array<StaticParamRecord> | Promise<Array<StaticParamRecord>>;
    dynamic?: boolean;
    prerender?: boolean;
}
interface HtPagesPluginOptions {
    root?: string;
    include?: string | string[];
    exclude?: string | string[];
    pagesDir?: string;
    pageExtensions?: string[];
    cleanUrls?: boolean;
    debug?: boolean;
    renderConcurrency?: number;
    renderBatchSize?: number;
    site?: string;
    missingAssets?: 'error' | 'warn';
    rss?: {
        site: string;
        title?: string;
        description?: string;
        routePrefix?: string;
    };
    mapOutputPath?: (page: HtPageInfo) => string;
}
type RouteParamDefinition = {
    name: string;
    type: 'single' | 'catch-all' | 'optional-catch-all';
};

declare function htPages(options?: HtPagesPluginOptions): Plugin;

type FetchCacheMode = 'auto' | 'memory' | 'fs' | 'none';
interface FetchWithCacheOptions {
    maxAge?: number;
    cacheKey?: string;
    forceRefresh?: boolean;
    cache?: FetchCacheMode;
}
declare function fetchWithCache(input: RequestInfo | URL, init?: RequestInit, options?: FetchWithCacheOptions): Promise<Response>;

export { type FetchWithCacheOptions, type HtPageInfo, type HtPageModule, type HtPageRenderContext, type HtPagesPluginOptions, type StaticParamRecord, htPages as default, fetchWithCache };
