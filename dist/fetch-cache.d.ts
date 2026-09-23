export type FetchCacheMode = 'auto' | 'memory' | 'fs' | 'none';
export interface FetchWithCacheOptions {
    maxAge?: number;
    cacheKey?: string;
    forceRefresh?: boolean;
    cache?: FetchCacheMode;
}
export declare function clearMemoryFetchCache(): void;
export declare function deleteMemoryFetchCache(cacheKey: string): void;
export declare function fetchWithCache(input: RequestInfo | URL, init?: RequestInit, options?: FetchWithCacheOptions): Promise<Response>;
