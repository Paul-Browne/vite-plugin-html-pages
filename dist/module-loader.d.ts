import { type ViteDevServer } from 'vite';
import type { HtPageInfo, HtPageModule } from './types';
export type PageModuleLoader = (entryPath: string, relativePath: string) => Promise<HtPageModule>;
export interface PageModuleLoaderHandle {
    loadModule: PageModuleLoader;
    close: () => Promise<void>;
}
export declare function isLocalPageTypesImport(id: string): boolean;
export declare function createPageModuleLoader(args: {
    mode: 'dev' | 'build';
    root: string;
    server?: ViteDevServer | null;
    getPages?: () => Promise<HtPageInfo[]>;
    configFile?: string;
    configMode?: string;
}): Promise<PageModuleLoaderHandle>;
