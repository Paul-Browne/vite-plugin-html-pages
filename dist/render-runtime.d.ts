import type { HtPageInfo, HtPageModule, HtStructuredPageModule } from './types.js';
export declare function isStructuredPageModule(value: unknown): value is HtStructuredPageModule;
export declare function renderPage(page: HtPageInfo, mod: HtPageModule, dev?: boolean): Promise<string>;
