type WarnContext = {
    page: {
        routePath: string;
        relativePath?: string;
    };
    onWarn: (message: string) => void;
};
export declare function validateStaticJsxTree(node: unknown, ctx: WarnContext): Promise<void>;
export {};
