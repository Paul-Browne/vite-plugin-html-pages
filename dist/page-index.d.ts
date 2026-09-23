import type { HtPageInfo, HtPageModule } from './types.js';
export declare function buildPageIndex(args: {
    entries: HtPageInfo[];
    modulesByEntry: Map<string, HtPageModule>;
    cleanUrls: boolean;
}): Promise<HtPageInfo[]>;
