import type { HtPageInfo, HtPagesPluginOptions } from './types';
export interface DevToolbarPageInfo {
    displayName: string;
    routePath: string;
    routePattern: string;
    relativePath: string;
    params: Record<string, unknown>;
    docsUrl: string;
    pluginVersion: string;
}
export declare function resolveDevToolbarEnabled(options: HtPagesPluginOptions): boolean;
export declare function resolveDevToolbarDocsUrl(options: HtPagesPluginOptions): string;
export declare function buildDevToolbarInfo(args: {
    page: HtPageInfo;
    options: HtPagesPluginOptions;
    pluginVersion: string;
}): DevToolbarPageInfo;
/**
 * Inject a lightweight, dev-only toolbar before `</body>`.
 * Never call this on production builds.
 */
export declare function injectDevToolbar(html: string, info: DevToolbarPageInfo): string;
