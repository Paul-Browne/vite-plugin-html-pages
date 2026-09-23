import type { RouteParamDefinition } from './types';
export declare function parseRouteParamSegment(segment: string): RouteParamDefinition | null;
export declare function extractRouteParamDefinitions(routePattern: string): RouteParamDefinition[];
