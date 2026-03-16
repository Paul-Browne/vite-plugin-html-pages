import type { ViteDevServer } from 'vite';
import { renderPage } from './render-runtime';
import { routeMatch } from './route-utils';
import type { HtPageInfo, HtPageModule } from './types';

function isDynamicOnly(mod: HtPageModule): boolean {
  return mod.dynamic === true || mod.prerender === false;
}

export function installDevServer(args: {
  server: ViteDevServer;
  getPages: () => Promise<HtPageInfo[]>;
  getEntries: () => Promise<HtPageInfo[]>;
}): void {
  const { server, getPages, getEntries } = args;

  server.middlewares.use(async (req, res, next) => {
    try {
      if (!req.url || req.method !== 'GET') return next();

      const pathname = req.url.split('?')[0];

      const pages = await getPages();
      const staticPage = pages.find((p) => p.routePath === pathname);

      if (staticPage) {
        const mod = (await server.ssrLoadModule(
          `/${staticPage.relativePath}`,
        )) as HtPageModule;

        const html = await renderPage(staticPage, mod, true);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
        return;
      }

      const entries = await getEntries();

      for (const entry of entries) {
        const mod = (await server.ssrLoadModule(
          `/${entry.relativePath}`,
        )) as HtPageModule;

        if (!isDynamicOnly(mod)) continue;

        const params = routeMatch(entry.routePattern, pathname);
        if (!params) continue;

        const page: HtPageInfo = {
          ...entry,
          routePath: pathname,
          fileName: '',
          params,
        };

        const html = await renderPage(page, mod, true);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  });
}