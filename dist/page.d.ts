type PageParams = Record<string, string | string[] | undefined>;
type StaticParams<TParams = PageParams> = TParams[];

type DataContext<TParams = PageParams> = {
  params: TParams;
  dev: boolean;
};

type RenderContext<TParams = PageParams, TData = unknown> = {
  params: TParams;
  data: TData;
  dev: boolean;
};

type PageContext<TParams = PageParams, TData = unknown> = {
  params: TParams;
  data?: TData;
  dev: boolean;
};

type PageModule<TParams = PageParams, TData = unknown> = {
  generateStaticParams?: () => StaticParams<TParams> | Promise<StaticParams<TParams>>;
  data?: (ctx: DataContext<TParams>) => TData | Promise<TData>;
  render: (ctx: RenderContext<TParams, TData>) => any;
};

declare function definePage<T extends (ctx: PageContext) => any>(
  fn: T,
): T;

declare function defineData<T extends (ctx: DataContext) => any>(
  fn: T,
): T;

declare function defineStaticParams<
  T extends () => StaticParams | Promise<StaticParams>
>(fn: T): T;

declare function definePageModule<TParams = PageParams, TData = unknown>(
  mod: PageModule<TParams, TData>,
): PageModule<TParams, TData>;

export { type DataContext, type PageContext, type PageModule, type PageParams, type RenderContext, type StaticParams, defineData, definePage, definePageModule, defineStaticParams };
