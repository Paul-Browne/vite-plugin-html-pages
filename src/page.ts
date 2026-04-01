export type PageParams = Record<string, string | string[] | undefined>;
export type StaticParams<TParams = PageParams> = TParams[];

export type DataContext<TParams = PageParams> = {
  params: TParams;
  dev: boolean;
};

export type RenderContext<TParams = PageParams, TData = unknown> = {
  params: TParams;
  data: TData;
  dev: boolean;
};

export type PageContext<TParams = PageParams, TData = unknown> = {
  params: TParams;
  data?: TData;
  dev: boolean;
};

export type PageModule<TParams = PageParams, TData = unknown> = {
  generateStaticParams?: () => StaticParams<TParams> | Promise<StaticParams<TParams>>;
  data?: (ctx: DataContext<TParams>) => TData | Promise<TData>;
  render: (ctx: RenderContext<TParams, TData>) => any;
};

export function definePage<
  T extends (ctx: PageContext) => any
>(fn: T): T {
  return fn;
}

export function defineData<
  T extends (ctx: DataContext) => any
>(fn: T): T {
  return fn;
}

export function defineStaticParams<
  T extends () => StaticParams | Promise<StaticParams>
>(fn: T): T {
  return fn;
}

export function definePageModule<TParams = PageParams, TData = unknown>(
  mod: PageModule<TParams, TData>,
): PageModule<TParams, TData> {
  return mod;
}