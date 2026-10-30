import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setDisplayName } from '../src/brand';
import { fetchWithCache } from '../src/fetch-cache';

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-fetch-'));
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  vi.stubGlobal('fetch', async () => new Response('body'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setDisplayName(undefined);
});

async function cacheDirs(): Promise<string[]> {
  await fetchWithCache('https://example.com/', undefined, {
    cache: 'fs',
    cacheKey: 'key',
  });

  return fs
    .readdirSync(path.join(cwd, 'node_modules/.cache'), { recursive: true })
    .map((file) => String(file).split(path.sep).join('/'))
    .filter((file) => file.endsWith('.json'));
}

describe('fetchWithCache on disk', () => {
  it("is named for the plugin when there's no display name", async () => {
    expect(await cacheDirs()).toEqual(['vite-plugin-html-pages/fetch/key.json']);
  });

  it('is named for the display name', async () => {
    setDisplayName('sitelo');

    expect(await cacheDirs()).toEqual(['sitelo/fetch/key.json']);
  });

  it('falls back to the plugin name for a display name that is no folder name', async () => {
    for (const name of ['My Site', '../escape', '..']) {
      fs.rmSync(path.join(cwd, 'node_modules'), { recursive: true, force: true });
      setDisplayName(name);

      expect(await cacheDirs(), name).toEqual([
        'vite-plugin-html-pages/fetch/key.json',
      ]);
    }
  });
});
