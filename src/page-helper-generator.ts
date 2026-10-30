import type { RouteParamDefinition } from './types.js';

export function paramsTypeFromDefinitions(
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

/**
 * `vite-plugin-html-pages/page` for a site that can't resolve the package
 * itself, as when it's a dependency of a dependency under pnpm. Vite loads
 * this as JavaScript, so it holds no types: per-route params are typed by
 * the `$types` declarations in typegen.ts.
 */
export const PAGE_HELPER_MODULE_SOURCE = `
export function definePage(fn) {
  return fn;
}

export function defineData(fn) {
  return fn;
}

export function defineStaticParams(fn) {
  return fn;
}

export function definePageModule(mod) {
  return mod;
}
`;
