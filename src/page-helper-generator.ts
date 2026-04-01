import type { HtPageInfo, RouteParamDefinition } from './types';

function paramsTypeFromDefinitions(
  paramDefinitions: RouteParamDefinition[],
): string {
  if (paramDefinitions.length === 0) {
    return '{}';
  }

  const fields = paramDefinitions.map((param) => {
    if (param.type === 'single') {
      return `${JSON.stringify(param.name)}: string`;
    }

    if (param.type === 'catch-all') {
      return `${JSON.stringify(param.name)}: string[]`;
    }

    return `${JSON.stringify(param.name)}?: string[]`;
  });

  return `{ ${fields.join('; ')} }`;
}

export function generateTypedPageHelper(page: HtPageInfo | undefined): string {
  const paramsType = page
    ? paramsTypeFromDefinitions(page.paramDefinitions ?? [])
    : '{}';

  return `
export type PageParams = ${paramsType};

export type StaticParams = PageParams[];

export type DataContext = {
  params: PageParams;
  dev: boolean;
};

export type RenderContext<TData = unknown> = {
  params: PageParams;
  data: TData;
  dev: boolean;
};

export type PageContext<TData = unknown> = {
  params: PageParams;
  data?: TData;
  dev: boolean;
};

export type PageModule<TData = unknown> = {
  generateStaticParams?: () => StaticParams | Promise<StaticParams>;
  data?: (ctx: DataContext) => TData | Promise<TData>;
  render: (ctx: RenderContext<TData>) => any;
};

export function definePage<T extends (ctx: PageContext) => any>(fn: T): T {
  return fn;
}

export function defineData<T extends (ctx: DataContext) => any>(fn: T): T {
  return fn;
}

export function defineStaticParams<
  T extends () => StaticParams | Promise<StaticParams>
>(fn: T): T {
  return fn;
}

export function definePageModule<TData>(
  mod: PageModule<TData>,
): PageModule<TData> {
  return mod;
}
`;
}