import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CACHE_DIR_NAME } from './constants';

export type FetchCacheMode = 'auto' | 'memory' | 'fs' | 'none';
export interface FetchAndCacheOptions {
  maxAge?: number;
  cacheKey?: string;
  forceRefresh?: boolean;
  cache?: FetchCacheMode;
}

type CachedResponseRecord = {
  timestamp: number;
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

const memoryCache = new Map<string, CachedResponseRecord>();

function createDefaultCacheKey(
  input: RequestInfo | URL,
  init?: RequestInit,
): string {
  const raw = JSON.stringify({
    url: String(input),
    method: init?.method ?? 'GET',
    headers: init?.headers ?? {},
    body: init?.body ?? null,
  });

  return createHash('sha256').update(raw).digest('hex');
}

function getCacheFilePath(cacheKey: string): string {
  return path.join(process.cwd(), CACHE_DIR_NAME, 'fetch', `${cacheKey}.json`);
}

function getEffectiveCacheMode(
  mode: FetchCacheMode | undefined,
): Exclude<FetchCacheMode, 'auto'> {
  if (mode === 'memory' || mode === 'fs' || mode === 'none') {
    return mode;
  }

  return process.env.NODE_ENV === 'production' ? 'fs' : 'memory';
}

function toResponse(cached: CachedResponseRecord): Response {
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers: cached.headers,
  });
}

function isFresh(cached: CachedResponseRecord, maxAgeSeconds: number): boolean {
  const ageSeconds = (Date.now() - cached.timestamp) / 1000;
  return ageSeconds <= maxAgeSeconds;
}

export function clearMemoryFetchCache(): void {
  memoryCache.clear();
}

export function deleteMemoryFetchCache(cacheKey: string): void {
  memoryCache.delete(cacheKey);
}

export async function fetchAndCache(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: FetchAndCacheOptions = {},
): Promise<Response> {
  const maxAge = options.maxAge ?? 60 * 60;
  const method = (init?.method ?? 'GET').toUpperCase();

  if (method !== 'GET' && !options.cacheKey) {
    return fetch(input, init);
  }

  const cacheMode = getEffectiveCacheMode(options.cache);
  const cacheKey = options.cacheKey ?? createDefaultCacheKey(input, init);

  if (cacheMode === 'none') {
    return fetch(input, init);
  }

  if (cacheMode === 'memory' && !options.forceRefresh) {
    const cached = memoryCache.get(cacheKey);

    if (cached && isFresh(cached, maxAge)) {
      return toResponse(cached);
    }
  }

  const filePath = getCacheFilePath(cacheKey);

  if (cacheMode === 'fs') {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (!options.forceRefresh) {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const cached = JSON.parse(raw) as CachedResponseRecord;

        if (isFresh(cached, maxAge)) {
          return toResponse(cached);
        }
      } catch {
        // cache miss or invalid cache; fetch fresh
      }
    }
  }

  const res = await fetch(input, init);
  const body = await res.text();

  const record: CachedResponseRecord = {
    timestamp: Date.now(),
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()],
    body,
  };

  if (cacheMode === 'memory') {
    memoryCache.set(cacheKey, record);
  } else if (cacheMode === 'fs') {
    await fs.writeFile(filePath, JSON.stringify(record), 'utf8');
  }

  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}
