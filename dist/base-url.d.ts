import type { HtmlAssetSource } from 'vite';
/**
 * The base to write into a page emitted at `fileName`.
 *
 * A relative base (`./`) becomes the path from that page back to the
 * output root, as in Vite's own HTML build: `blog/post/index.html` gets
 * `../../`. Any other base is used as is, with a trailing slash.
 */
export declare function pageBase(base: string, fileName: string): string;
/** `/site.css` under `/repo/` is `/repo/site.css`; anything not root-relative is left alone. */
export declare function joinBase(url: string, base: string): string;
/**
 * The root-relative URL a page meant by one carrying `base`:
 * `/repo/site.css` is `/site.css`. A URL not under the base comes back
 * unchanged.
 */
export declare function stripBase(url: string, base: string): string;
/**
 * Joins `base` onto the root-relative URLs that Vite's dev server would
 * put it on: asset attributes (Vite's list, plus any
 * `html.additionalAssetSources`) and literal `import('/…')` in inline
 * scripts. `base` is the page's own — see {@link pageBase}.
 */
export declare function applyBaseToHtml(html: string, base: string, additionalAssetSources?: Record<string, HtmlAssetSource>): string;
