import type { RouteParamDefinition } from './types';

export function parseRouteParamSegment(
  segment: string,
): RouteParamDefinition | null {
  if (segment.startsWith('*?:')) {
    return {
      name: segment.slice(3),
      type: 'optional-catch-all',
    };
  }

  if (segment.startsWith('*:')) {
    return {
      name: segment.slice(2),
      type: 'catch-all',
    };
  }

  if (segment.startsWith(':')) {
    return {
      name: segment.slice(1),
      type: 'single',
    };
  }

  return null;
}

export function extractRouteParamDefinitions(
  routePattern: string,
): RouteParamDefinition[] {
  return routePattern
    .split('/')
    .filter(Boolean)
    .map((segment) => parseRouteParamSegment(segment))
    .filter((value): value is RouteParamDefinition => value != null);
}