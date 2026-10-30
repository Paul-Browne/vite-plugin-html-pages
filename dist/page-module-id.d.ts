/** The URL to import a page module by. */
export declare function pageModuleUrl(entryPath: string, relativePath: string): string;
/** The page file an escaped page module id stands for, or `null`. */
export declare function pageFileFromModuleId(id: string): string | null;
export declare function resolveEscapedPageId(id: string): string | null;
export declare function loadEscapedPage(id: string): Promise<string> | null;
/**
 * The id of the escaped module Vite holds for a changed page file, if
 * it is one. Vite's module graph only knows the escaped name, so a
 * change to the real file has to be pointed at it.
 */
export declare function escapedPageIdForFile(file: string): string | null;
