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

export type PageContext = {
  params: PageParams;
  data?: unknown;
  dev: boolean;
};

export function definePage<T extends (ctx: PageContext) => any>(fn: T): T {
  return fn;
}
`;
}