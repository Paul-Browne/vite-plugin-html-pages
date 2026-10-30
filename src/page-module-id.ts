import fs from 'node:fs';

import { toPosix } from './path-utils.js';

/*
 * Vite reads everything after a `?` in a module id as its query, so an
 * optional catch-all page such as `[...path]?.ht.js` can't be loaded by
 * its own path: Vite looks for a file named `[...path]` and finds none.
 * Escaping the `?` doesn't help on its own, since no resolver decodes
 * it back. Such a page is loaded through its absolute path with the `?`
 * escaped, which `resolveId` keeps and `load` reads from the real file.
 *
 * The id still ends in the page's extension, so the usual transforms
 * apply, and it sits in the page's own directory, so relative imports
 * resolve as they would. `import.meta.url` is the one thing that shows
 * the escaped name.
 */
const ESCAPED_QUESTION_MARK = '%3F';

/** Whether Vite can load this page by its own path. */
function needsEscapedId(filePath: string): boolean {
  return filePath.includes('?');
}

function escapedPageId(entryPath: string): string {
  return toPosix(entryPath).split('?').join(ESCAPED_QUESTION_MARK);
}

/** The URL to import a page module by. */
export function pageModuleUrl(entryPath: string, relativePath: string): string {
  return needsEscapedId(relativePath)
    ? escapedPageId(entryPath)
    : `/${relativePath}`;
}

/** The page file an escaped page module id stands for, or `null`. */
export function pageFileFromModuleId(id: string): string | null {
  if (!id.includes(ESCAPED_QUESTION_MARK)) return null;

  const file = id.split(ESCAPED_QUESTION_MARK).join('?');

  return fs.existsSync(file) ? file : null;
}

export function resolveEscapedPageId(id: string): string | null {
  return pageFileFromModuleId(id) ? id : null;
}

export function loadEscapedPage(id: string): Promise<string> | null {
  const file = pageFileFromModuleId(id);

  return file ? fs.promises.readFile(file, 'utf8') : null;
}

/**
 * The id of the escaped module Vite holds for a changed page file, if
 * it is one. Vite's module graph only knows the escaped name, so a
 * change to the real file has to be pointed at it.
 */
export function escapedPageIdForFile(file: string): string | null {
  return needsEscapedId(file) ? escapedPageId(file) : null;
}
