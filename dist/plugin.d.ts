import type { Plugin } from 'vite';
import type { HtPagesPluginOptions } from './types.js';
/**
 * Fallback 404 page, used when the project has no `src/404.ht.js`.
 *
 * The home link has to honour Vite's `base`: on a site served from
 * `/repo/`, a hardcoded `/` sends the visitor to the host root rather
 * than back into the site.
 */
export declare function defaultNotFoundHtml(base: string): string;
export declare function htPages(options?: HtPagesPluginOptions): Plugin;
export default htPages;
