import type { HtPageInfo } from './types.js';
export declare function getGeneratedTypesRoot(root: string, generatedTypesDir?: string): string;
export declare function getGeneratedHelperPath(args: {
    root: string;
    pagesDir: string;
    page: HtPageInfo;
    generatedTypesDir?: string;
}): string;
export declare function writePageTypeDeclarations(args: {
    root: string;
    pagesDir: string;
    entries: HtPageInfo[];
    generatedTypesDir?: string;
}): Promise<void>;
