export type PageParams = Record<string, string | string[] | undefined>;

export type PageContext = {
  params: PageParams;
  data?: unknown;
  dev: boolean;
};

export declare function definePage<T extends (ctx: PageContext) => any>(
  fn: T,
): T;

export declare function defineStaticParams<
  T extends () => Array<PageParams> | Promise<Array<PageParams>>
>(fn: T): T;