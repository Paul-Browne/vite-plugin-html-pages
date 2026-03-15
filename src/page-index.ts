import { compareRoutePriority, expandStaticPaths, fileNameFromRoute } from './route-utils';
import type { HtPageInfo, HtPageModule, StaticParamRecord } from './types';

export async function buildPageIndex(args: {
  entries: HtPageInfo[];
  modulesByEntry: Map<string, HtPageModule>;
  cleanUrls: boolean;
}): Promise<HtPageInfo[]> {
  const { entries, modulesByEntry, cleanUrls } = args;
  const pages: HtPageInfo[] = [];

  for (const entry of entries) {
    const mod = modulesByEntry.get(entry.entryPath) ?? {};

    if (entry.dynamic) {
      const rows = mod.generateStaticParams ? await mod.generateStaticParams() : [];
      pages.push(
        ...expandStaticPaths(
          {
            id: entry.id,
            entryPath: entry.entryPath,
            absolutePath: entry.absolutePath,
            relativePath: entry.relativePath,
            routePattern: entry.routePattern,
            dynamic: entry.dynamic,
            paramNames: entry.paramNames,
          } as Omit<HtPageInfo, 'routePath' | 'fileName' | 'params'>,
          rows as StaticParamRecord[],
          cleanUrls,
        ),
      );
    } else {
      pages.push({
        ...entry,
        routePath: entry.routePattern,
        fileName: fileNameFromRoute(entry.routePattern, cleanUrls),
        params: {},
      });
    }
  }

  pages.sort((a, b) => compareRoutePriority(a.routePattern, b.routePattern));
  return pages;
}