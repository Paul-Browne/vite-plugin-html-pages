import type { ViteDevServer } from 'vite';
import { renderPage } from './render-runtime';
import { routeMatch } from './route-utils';
import type { HtPageInfo, HtPageModule } from './types';

export function installDevServer(args: {
  server: ViteDevServer;
  getPages: () => Promise<HtPageInfo[]>;
}): void {
  const { server, getPages } = args;

  server.middlewares.use(async (req, res, next) => {
    try {
      if (!req.url || req.method !== 'GET') return next();

      const pathname = req.url.split('?')[0];
      const pages = await getPages();

      for (const page of pages) {
        const params = routeMatch(page.routePattern, pathname);
        if (!params) continue;

        const mod = (await server.ssrLoadModule(
          `/${page.relativePath}`,
        )) as HtPageModule;

        const resolvedPage = {
          ...page,
          routePath: pathname || '/',
          params,
        };

        const html = await renderPage(resolvedPage, mod, true);

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