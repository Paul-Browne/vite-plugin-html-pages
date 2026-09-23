export interface HtmlAssetValidationOptions {
    root: string;
    pagesDir: string;
    html: string;
    pluginName: string;
    pageLabel?: string;
    missingAssets?: 'error' | 'warn';
    externalAssets?: string | string[];
}
/**
 * Collects every root-relative URL the HTML references (any href/src
 * attribute plus literal dynamic imports), with query/hash stripped.
 * Used to decide which source assets must be emitted at build time.
 */
export declare function collectLocalAssetUrls(html: string): string[];
export declare function validateHtmlAssetReferences(options: HtmlAssetValidationOptions): void;
