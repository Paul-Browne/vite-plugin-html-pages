import { Plugin } from 'vite';
import * as rollup from 'rollup';

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
    dev?: boolean;
}
interface HtPageModule {
    default?: string | ((ctx: HtPageRenderContext) => string | Promise<string>);
    data?: (ctx: HtPageRenderContext) => unknown | Promise<unknown>;
    generateStaticParams?: () => StaticParamRecord[] | Promise<StaticParamRecord[]>;
}
interface HtPagesPluginOptions {
    root?: string;
    include?: string | string[];
    exclude?: string | string[];
    pagesDir?: string;
    renderConcurrency?: number;
    renderBatchSize?: number;
    cleanUrls?: boolean;
    ssrPlugins?: rollup.Plugin[];
    mapOutputPath?: (page: HtPageInfo) => string;
}

declare function htPages(options?: HtPagesPluginOptions): Plugin;

export { type HtPageInfo, type HtPageModule, type HtPageRenderContext, type HtPagesPluginOptions, type StaticParamRecord, htPages };
