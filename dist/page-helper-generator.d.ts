import type { HtPageInfo, RouteParamDefinition } from './types.js';
export declare function paramsTypeFromDefinitions(paramDefinitions: RouteParamDefinition[]): string;
export declare function generateTypedPageHelper(page?: HtPageInfo): string;
