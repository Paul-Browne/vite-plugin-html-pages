type PageParams = Record<string, string | string[] | undefined>;

type PageContext = {
  params: PageParams;
  data?: unknown;
  dev: boolean;
};

declare function definePage<T extends (ctx: PageContext) => any>(
  fn: T,
): T;

declare function defineStaticParams<
  T extends () => Array<PageParams> | Promise<Array<PageParams>>
>(fn: T): T;

export { type PageContext, type PageParams, definePage, defineStaticParams };
