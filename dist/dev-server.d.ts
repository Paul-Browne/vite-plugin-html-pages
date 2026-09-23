import type { ViteDevServer } from 'vite';
import type { HtPageInfo, HtPagesPluginOptions } from './types.js';
export declare function installDevServer(args: {
    server: ViteDevServer;
    root: string;
    pagesDir: string;
    options: HtPagesPluginOptions;
    getPages: () => Promise<HtPageInfo[]>;
    getEntries?: () => Promise<HtPageInfo[]>;
}): void;
