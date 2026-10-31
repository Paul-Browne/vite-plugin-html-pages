/**
 * Fallback 404 page, used when the project has no `src/404.ht.js`: the
 * build writes it to `404.html`, and the dev server answers a miss with it.
 *
 * The home link has to honour Vite's `base`: on a site served from
 * `/repo/`, a hardcoded `/` sends the visitor to the host root rather
 * than back into the site.
 */
export declare function defaultNotFoundHtml(base: string): string;
