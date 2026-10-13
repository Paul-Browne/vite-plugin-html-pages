export interface HtmlAssetValidationOptions {
    root: string;
    pagesDir: string;
    html: string;
    pluginName: string;
    pageLabel?: string;
    missingAssets?: 'error' | 'warn';
    externalAssets?: string | string[];
    /**
     * The base the page's URLs were written with — Vite's `base`, or for a
     * relative base the page's path back to the output root. It comes off
     * a URL before the URL is looked up on disk or matched against
     * `externalAssets`, both of which are written for the site root.
     * Defaults to `/`.
     */
    base?: string;
}
/**
 * Collects every root-relative URL the HTML references (any href/src
 * attribute plus literal dynamic imports), with `base` taken off and
 * query/hash stripped. Used to decide which source assets must be
 * emitted at build time.
 */
export declare function collectLocalAssetUrls(html: string, base?: string): string[];
export declare function validateHtmlAssetReferences(options: HtmlAssetValidationOptions): void;
