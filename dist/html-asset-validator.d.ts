export interface HtmlAssetValidationOptions {
    root: string;
    pagesDir: string;
    html: string;
    pluginName: string;
    pageLabel?: string;
    /**
     * Where the page is emitted, relative to the output directory
     * (`blog/hello/index.html`). Relative URLs resolve against it, as they
     * do in the browser. Defaults to `index.html`.
     */
    pageFileName?: string;
    missingAssets?: 'error' | 'warn';
    externalAssets?: string | string[];
}
/**
 * Collects the path of every same-site URL the HTML references (any
 * href/src attribute plus literal dynamic imports), with query/hash
 * stripped. Relative URLs are resolved against `pageFileName`. Used to
 * decide which source assets must be emitted at build time.
 */
export declare function collectLocalAssetUrls(html: string, pageFileName?: string): string[];
/**
 * Points references to compiled sources at what the build emitted for
 * them, so `src="/main.ts"` becomes `src="/main.js"`. `outputPaths` maps
 * a source path (`/main.ts`) to its output path (`/main.js`).
 *
 * Covers the same references `collectLocalAssetUrls` reads, except in
 * `<pre>`/`<code>` samples, which should go on showing the source name.
 * Only the extension changes, so a relative URL stays relative and a
 * query or hash is kept.
 */
export declare function rewriteCompiledAssetUrls(html: string, pageFileName: string, outputPaths: Map<string, string>): string;
export declare function validateHtmlAssetReferences(options: HtmlAssetValidationOptions): void;
