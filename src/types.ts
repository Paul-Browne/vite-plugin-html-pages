import type { Plugin as RollupPlugin } from 'rollup';

export interface StaticParamRecord {
  [key: string]: string | number | boolean;
}

export type HtPageParams = Record<string, string | string[] | undefined>;

export interface HtPageInfo {
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

export type HtPageRenderContext = {
  page: HtPageInfo;
  params: HtPageParams;
  data?: unknown;
  dev: boolean;
};

export interface HtPageModule {
  default?: ((ctx: {
    page: HtPageInfo;
    params: Record<string, string | string[] | undefined>;
    data?: unknown;
    dev: boolean;
  }) => string | Promise<string>) | string;
  data?: (ctx: {
    page: HtPageInfo;
    params: Record<string, string | string[] | undefined>;
    dev: boolean;
  }) => unknown | Promise<unknown>;
  generateStaticParams?: () =>
    | Array<Record<string, string | number | boolean>>
    | Promise<Array<Record<string, string | number | boolean>>>;
  dynamic?: boolean;
  prerender?: boolean;
}

export interface HtPagesPluginOptions {
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

export type RouteParamDefinition = {
  name: string;
  type: 'single' | 'catch-all' | 'optional-catch-all';
};