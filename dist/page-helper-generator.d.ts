import type { RouteParamDefinition } from './types.js';
export declare function paramsTypeFromDefinitions(paramDefinitions: RouteParamDefinition[]): string;
/**
 * `vite-plugin-html-pages/page` for a site that can't resolve the package
 * itself, as when it's a dependency of a dependency under pnpm. Vite loads
 * this as JavaScript, so it holds no types: per-route params are typed by
 * the `$types` declarations in typegen.ts.
 */
export declare const PAGE_HELPER_MODULE_SOURCE = "\nexport function definePage(fn) {\n  return fn;\n}\n\nexport function defineData(fn) {\n  return fn;\n}\n\nexport function defineStaticParams(fn) {\n  return fn;\n}\n\nexport function definePageModule(mod) {\n  return mod;\n}\n";
