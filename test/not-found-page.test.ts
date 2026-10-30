import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

import { htPages } from '../src/plugin';
import type { HtPagesPluginOptions } from '../src/types';

const page = (body: string) =>
  `export default () => \`<!doctype html><html><head><link rel="stylesheet" href="/site.css"></head><body>${body}</body></html>\`;\n`;

async function buildSite(
  options: HtPagesPluginOptions,
  base?: string,
): Promise<{
  read: (fileName: string) => string;
  files: () => string[];
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-404-'));
  const files: Record<string, string> = {
    'package.json': '{"type":"module"}',
    'src/site.css': 'body { color: red; }\n',
    'src/index.ht.js': page('home'),
    'src/about.ht.js': page('about'),
    'src/404.ht.js': page('<h1>Lost</h1>'),
  };

  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  await build({
    root,
    base,
    configFile: false,
    logLevel: 'silent',
    plugins: [htPages({ devToolbar: false, ...options })],
    build: { outDir: 'dist', emptyOutDir: true },
  });

  const dist = path.join(root, 'dist');

  return {
    read: (fileName) => fs.readFileSync(path.join(dist, fileName), 'utf8'),
    files: () =>
      (fs.readdirSync(dist, { recursive: true }) as string[])
        .map((file) => file.split(path.sep).join('/'))
        .sort(),
  };
}

describe('a custom 404 page', () => {
  it('is emitted once, as 404.html, with clean URLs', async () => {
    const site = await buildSite({ site: 'https://example.com' });

    expect(site.read('404.html')).toContain('<h1>Lost</h1>');
    expect(site.files()).not.toContain('404/index.html');
    expect(site.files()).not.toContain('404');
  }, 30_000);

  it('is emitted once, as 404.html, without clean URLs', async () => {
    const site = await buildSite({ cleanUrls: false });

    expect(site.files().filter((f) => f.includes('404'))).toEqual(['404.html']);
    expect(site.read('404.html')).toContain('<h1>Lost</h1>');
  }, 30_000);

  it('stays at 404.html whatever mapOutputPath says', async () => {
    const site = await buildSite({
      mapOutputPath: (p) => `pages/${p.fileName}`,
    });

    expect(site.read('404.html')).toContain('<h1>Lost</h1>');
    expect(site.read('pages/about/index.html')).toContain('about');
    expect(site.files().filter((f) => f.includes('404'))).toEqual(['404.html']);
  }, 30_000);

  it('is left out of the sitemap and the RSS feed', async () => {
    const site = await buildSite({
      site: 'https://example.com',
      rss: { site: 'https://example.com', routePrefix: '/' },
    });

    const sitemap = site.read('sitemap.xml');

    expect(sitemap).toContain('<loc>https://example.com/about</loc>');
    expect(sitemap).not.toContain('404');
    expect(site.read('rss.xml')).toContain('https://example.com/about');
    expect(site.read('rss.xml')).not.toContain('404');
  }, 30_000);

  it('takes a relative base from where it ships, not from /404/', async () => {
    const site = await buildSite({}, './');

    expect(site.read('404.html')).toContain('href="./site.css"');
  }, 30_000);
});
