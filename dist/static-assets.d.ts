import { type ResolvedConfig } from 'vite';
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
/**
 * CommonJS, which browsers can't load. The build never emits these from
 * the pages directory, referenced or not, so server-side code in them
 * stays out of dist.
 */
export declare const COMMONJS_EXTENSIONS: string[];
export declare function collectStaticAssets(args: CollectStaticAssetsArgs): Promise<StaticAssetFile[]>;
export declare function copyStaticAssetSource(asset: StaticAssetFile): Promise<Uint8Array>;
export declare function buildProcessedStaticAssets(args: {
    root: string;
    pagesDir: string;
    assets: StaticAssetFile[];
    minify?: boolean;
    sourcemap?: boolean;
    /** The resolved Vite config, so JSX compiles as it does in dev. */
    viteConfig?: ResolvedConfig;
}): Promise<Map<string, string | Uint8Array>>;
