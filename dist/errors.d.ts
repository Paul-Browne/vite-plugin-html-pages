import type { HtPageInfo } from './types.js';
export declare function invalidHtmlReturn(page: HtPageInfo, value: unknown): Error;
export declare function missingDefaultExport(page: HtPageInfo): Error;
export declare function pageError(page: HtPageInfo, cause: unknown): Error;
