export interface StaticParamRecord {
    [key: string]: string | number | boolean;
  }
  
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
    params: Record<string, string>;
  }
  
  export interface HtPageRenderContext {
    page: HtPageInfo;
    params: Record<string, string>;
    data?: unknown;
    dev?: boolean;
  }
  
  export interface HtPageModule {
    default?: string | ((ctx: HtPageRenderContext) => string | Promise<string>);
    data?: (ctx: HtPageRenderContext) => unknown | Promise<unknown>;
    generateStaticParams?: () => StaticParamRecord[] | Promise<StaticParamRecord[]>;
  }
  
  export interface HtPagesPluginOptions {
    root?: string;
    include?: string | string[];
    exclude?: string | string[];
    pagesDir?: string;
    renderConcurrency?: number;
    renderBatchSize?: number;
    cleanUrls?: boolean;
    ssrPlugins?: import('rollup').Plugin[];
    mapOutputPath?: (page: HtPageInfo) => string;
  }