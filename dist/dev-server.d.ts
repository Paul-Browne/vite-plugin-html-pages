import type { ViteDevServer } from 'vite';
import type { HtPageInfo, HtPagesPluginOptions } from './types.js';
/**
 * Serve pages from the dev server.
 *
 * Returns the hook that answers a URL with no page behind it, for the
 * plugin's `configureServer` to hand back to Vite, which runs it after
 * its own middlewares: a miss is only a miss once Vite has had its turn
 * at `public/` and the rest.
 */
export declare function installDevServer(args: {
    server: ViteDevServer;
    root: string;
    pagesDir: string;
    options: HtPagesPluginOptions;
    getPages: () => Promise<HtPageInfo[]>;
    getEntries?: () => Promise<HtPageInfo[]>;
}): () => void;
