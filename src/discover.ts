import path from 'node:path';
import { normalizeFsPath, toPosix } from './path-utils';
import { isDynamicPage, toRoutePattern } from './route-utils';
import { extractRouteParamDefinitions } from './route-params';
import type { HtPageInfo, HtPagesPluginOptions } from './types';
import { PLUGIN_NAME } from './constants';

function buildDefaultIncludeGlobs(
  pagesDir: string,
  pageExtensions: string[],
): string[] {
  return pageExtensions.map((ext) => {
    const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
    return `${pagesDir}/**/*.${cleanExt}`;
  });
}

export async function discoverEntryPages(
  root: string,
  options: HtPagesPluginOptions,
): Promise<HtPageInfo[]> {
  const fgModule = await import('fast-glob');
  const fg = (fgModule.default ?? fgModule) as typeof import('fast-glob');

  const pagesDir = options.pagesDir ?? 'src';
  const pageExtensions = options.pageExtensions?.length
    ? options.pageExtensions
    : ['.ht.js', '.html.js', '.ht.ts', '.html.ts', '.ht.jsx', '.html.jsx', '.ht.tsx', '.html.tsx'];

  const include = Array.isArray(options.include)
    ? options.include
    : options.include
      ? [options.include]
      : buildDefaultIncludeGlobs(pagesDir, pageExtensions);

  const exclude = Array.isArray(options.exclude)
    ? options.exclude
    : options.exclude
      ? [options.exclude]
      : [];

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
      const routePattern = toRoutePattern(relativeFromPagesDir, pageExtensions);
      const paramDefinitions = extractRouteParamDefinitions(routePattern);

      return {
        id: entryPath,
        entryPath,
        absolutePath: entryPath,
        relativePath,
        routePattern,
        routePath: routePattern,
        fileName: '',
        dynamic,
        paramNames: paramDefinitions.map((p) => p.name),
        paramDefinitions,
        params: {},
      } satisfies HtPageInfo;
    });
}