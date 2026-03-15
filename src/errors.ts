import type { HtPageInfo } from './types';

export function invalidHtmlReturn(page: HtPageInfo, value: unknown): Error {
  return new Error(
    `[vite-plugin-ht-pages] Page "${page.relativePath}" must resolve to an HTML string, got ${typeof value}`,
  );
}

export function pageError(page: HtPageInfo, cause: unknown): Error {
  const message = `[vite-plugin-ht-pages] Failed to render ${page.relativePath} (${page.routePath})`;
  if (cause instanceof Error && cause.stack) {
    const err = new Error(message);
    err.stack = `${err.stack}
Caused by:
${cause.stack}`;
    return err;
  }
  return new Error(message);
}