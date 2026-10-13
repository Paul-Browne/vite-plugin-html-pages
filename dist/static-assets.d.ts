export interface StaticAssetFile {
    absolutePath: string;
    relativePathFromSrc: string;
    outputFileName: string;
    kind: 'copy' | 'process';
}
export interface CollectStaticAssetsArgs {
    root: string;
    pagesDir: string;
    pageExtensions: string[];
}
/**
 * Script sources esbuild writes out as `.js`. Pages reference them by
 * their source name, which is what the dev server serves, and the build
 * rewrites those URLs to the output name.
 */
export declare const COMPILED_TO_JS_EXTENSIONS: string[];
export declare function collectStaticAssets(args: CollectStaticAssetsArgs): Promise<StaticAssetFile[]>;
export declare function copyStaticAssetSource(asset: StaticAssetFile): Promise<Uint8Array>;
export declare function buildProcessedStaticAssets(args: {
    root: string;
    pagesDir: string;
    assets: StaticAssetFile[];
    minify?: boolean;
    sourcemap?: boolean;
}): Promise<Map<string, string | Uint8Array>>;
