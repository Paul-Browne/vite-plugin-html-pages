import path from 'node:path';
import { normalizeFsPath, toPosix } from './path-utils';
import { getParamNames, isDynamicPage, toRoutePattern } from './route-utils';
import type { HtPageInfo, HtPagesPluginOptions } from './types';
import { PLUGIN_NAME } from './constants';

export async function discoverEntryPages(
  root: string,
  options: HtPagesPluginOptions,
): Promise<HtPageInfo[]> {
  const fgModule = await import('fast-glob');
  const fg = (fgModule.default ?? fgModule) as typeof import('fast-glob');

  const include = Array.isArray(options.include)
    ? options.include
    : [options.include ?? 'src/**/*.ht.js'];

  const exclude = Array.isArray(options.exclude)
    ? options.exclude
    : options.exclude
      ? [options.exclude]
      : [];

  const pagesDir = options.pagesDir ?? 'src';
  const pagesRoot = normalizeFsPath(path.join(root, pagesDir));

  const files = await fg.glob(include, {
    cwd: root,
    ignore: exclude,
    absolute: true,
  });

  return files
    .sort()
    .map((absolutePath) => {
      const entryPath = normalizeFsPath(absolutePath);
      const relativePath = toPosix(path.relative(root, entryPath));
      const relativeFromPagesDir = toPosix(path.relative(pagesRoot, entryPath));

      if (
        relativeFromPagesDir.startsWith('../') ||
        relativeFromPagesDir === '..'
      ) {
        throw new Error(
          `[${PLUGIN_NAME}] Page is outside pagesDir: ${entryPath} (pagesDir: ${pagesDir})`,
        );
      }

      const dynamic = isDynamicPage(relativeFromPagesDir);
      const routePattern = toRoutePattern(relativeFromPagesDir);

      return {
        id: entryPath,
        entryPath,
        absolutePath: entryPath,
        relativePath,
        routePattern,
        routePath: routePattern,
        fileName: '',
        dynamic,
        paramNames: getParamNames(relativeFromPagesDir),
        params: {},
      } satisfies HtPageInfo;
    });
}