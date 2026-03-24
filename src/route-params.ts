import type { RouteParamDefinition } from './types';

export function parseRouteParamSegment(
  segment: string,
): RouteParamDefinition | null {
  if (segment.startsWith('[...') && segment.endsWith(']?')) {
    return {
      name: segment.slice(4, -2),
      type: 'optional-catch-all',
    };
  }

  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return {
      name: segment.slice(4, -1),
      type: 'catch-all',
    };
  }

  if (segment.startsWith('[') && segment.endsWith(']')) {
    return {
      name: segment.slice(1, -1),
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