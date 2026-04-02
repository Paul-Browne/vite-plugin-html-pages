export type StaticParamPrimitive = string | number | boolean;
export type StaticParamValue = StaticParamPrimitive | StaticParamPrimitive[];

export interface StaticParamRecord {
  [key: string]: StaticParamValue;
}

export type HtPageParamValue = string | string[] | undefined;
export type HtPageParams = Record<string, HtPageParamValue>;

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

export type HtPageRenderResult = string | unknown;
export type HtPageRenderResultAsync =
  | HtPageRenderResult
  | Promise<HtPageRenderResult>;

export type HtPageRenderContext = {
  page: HtPageInfo;
  params: HtPageParams;
  data?: unknown;
  dev: boolean;
};

export interface HtStructuredPageModule<TData = unknown> {
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
  generateStaticParams?: () =>
    | Array<StaticParamRecord>
    | Promise<Array<StaticParamRecord>>;
  dynamic?: boolean;
  prerender?: boolean;
}

export interface HtPageModule {
  default?:
    | ((ctx: {
        page: HtPageInfo;
        params: HtPageParams;
        data?: unknown;
        dev: boolean;
      }) => HtPageRenderResultAsync)
    | string
    | HtStructuredPageModule;
  data?: (ctx: {
    page: HtPageInfo;
    params: HtPageParams;
    dev: boolean;
  }) => unknown | Promise<unknown>;
  generateStaticParams?: () =>
    | Array<StaticParamRecord>
    | Promise<Array<StaticParamRecord>>;
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

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type Merge<A, B> = Simplify<A & B>;

type SegmentParam<S extends string> =
  S extends `[...${infer Name}]?`
    ? { [K in Name]?: string[] }
    : S extends `[...${infer Name}]`
      ? { [K in Name]: string[] }
      : S extends `[${infer Name}]`
        ? { [K in Name]: string }
        : {};

type RouteParamsInternal<Path extends string> =
  Path extends `${infer Head}/${infer Tail}`
    ? Merge<SegmentParam<Head>, RouteParamsInternal<Tail>>
    : SegmentParam<Path>;

export type RouteParams<Path extends string> =
  Path extends `/${infer Rest}`
    ? Simplify<RouteParamsInternal<Rest>>
    : Simplify<RouteParamsInternal<Path>>;