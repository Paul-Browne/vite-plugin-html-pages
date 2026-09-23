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
export declare function collectStaticAssets(args: CollectStaticAssetsArgs): Promise<StaticAssetFile[]>;
export declare function copyStaticAssetSource(asset: StaticAssetFile): Promise<Uint8Array>;
export declare function buildProcessedStaticAssets(args: {
    root: string;
    pagesDir: string;
    assets: StaticAssetFile[];
    minify?: boolean;
    sourcemap?: boolean;
}): Promise<Map<string, string | Uint8Array>>;
