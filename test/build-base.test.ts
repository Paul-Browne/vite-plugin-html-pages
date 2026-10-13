import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { build } from 'vite';
import { describe, expect, it } from 'vitest';

import { htPages } from '../src/plugin';
import type { HtPagesPluginOptions } from '../src/types';

type Site = {
  root: string;
  read: (fileName: string) => string;
  has: (fileName: string) => boolean;
};

const page = (head: string, body = '') =>
  `export default () => \`<!doctype html><html><head>${head}</head><body>${body}</body></html>\`;\n`;

async function buildSite(
  files: Record<string, string>,
  base: string | undefined,
  options: HtPagesPluginOptions = {},
): Promise<Site> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-base-'));

  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');

  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  // Inline config is what `vite build --base /repo/` amounts to: no
  // config file carries the base.
  await build({
    root,
    base,
    configFile: false,
    logLevel: 'silent',
    plugins: [htPages({ devToolbar: false, ...options })],
    build: { outDir: 'dist', emptyOutDir: true },
  });

  const out = (fileName: string) => path.join(root, 'dist', fileName);

  return {
    root,
    read: (fileName) => fs.readFileSync(out(fileName), 'utf8'),
    has: (fileName) => fs.existsSync(out(fileName)),
  };
}

const assets = {
  'src/site.css': 'body { color: red; }\n',
  'src/main.js': 'console.log("main");\n',
  'src/logo.png': 'png',
};

describe('build under a base', () => {
  it('puts the base on root-relative asset URLs, as the dev server does', async () => {
    const site = await buildSite(
      {
        ...assets,
        'src/index.ht.js': page(
          '<link rel="stylesheet" href="/site.css"><script type="module" src="/main.js"></script>',
          '<img src="/logo.png" srcset="/logo.png 1x"><a href="/about">About</a>',
        ),
      },
      '/repo/',
    );

    const html = site.read('index.html');

    expect(html).toContain('<link rel="stylesheet" href="/repo/site.css">');
    expect(html).toContain('<script type="module" src="/repo/main.js">');
    expect(html).toContain('<img src="/repo/logo.png" srcset="/repo/logo.png 1x">');
    // A link between pages is not an asset URL: Vite leaves it alone in
    // dev, and so does the build.
    expect(html).toContain('<a href="/about">About</a>');
  }, 30_000);

  it('still emits the code assets the pages reference', async () => {
    const site = await buildSite(
      {
        ...assets,
        'src/unused.js': 'console.log("unused");\n',
        'src/index.ht.js': page(
          '<link rel="stylesheet" href="/site.css"><script type="module" src="/main.js"></script>',
        ),
      },
      '/repo/',
    );

    // dist/ is what gets served at /repo/, so the files sit at its root.
    expect(site.has('site.css')).toBe(true);
    expect(site.has('main.js')).toBe(true);
    expect(site.has('logo.png')).toBe(true);
    expect(site.has('unused.js')).toBe(false);
  }, 30_000);

  it('gives nested pages and the 404 page the same base', async () => {
    const site = await buildSite(
      {
        ...assets,
        'src/index.ht.js': page('<link rel="stylesheet" href="/site.css">'),
        'src/blog/post.ht.js': page('<link rel="stylesheet" href="/site.css">'),
        'src/404.ht.js': page('<link rel="stylesheet" href="/site.css">', '<h1>Lost</h1>'),
      },
      '/repo/',
    );

    expect(site.read('blog/post/index.html')).toContain('href="/repo/site.css"');
    expect(site.read('404/index.html')).toContain('href="/repo/site.css"');
    expect(site.read('404.html')).toContain('href="/repo/site.css"');
  }, 30_000);

  it('leaves the default 404 page linking home under the base', async () => {
    const site = await buildSite(
      { 'src/index.ht.js': page('') },
      '/repo/',
    );

    expect(site.read('404.html')).toContain('<a href="/repo/">Go back home</a>');
  }, 30_000);

  it('fails a page that wrote the base in by hand, and says why', async () => {
    await expect(
      buildSite(
        {
          ...assets,
          'src/index.ht.js': page('<link rel="stylesheet" href="/repo/site.css">'),
        },
        '/repo/',
      ),
    ).rejects.toThrow(/\/repo\/repo\/site\.css[\s\S]*twice[\s\S]*Write "\/site\.css"/);
  }, 30_000);

  it('leaves an element marked vite-ignore as written', async () => {
    const site = await buildSite(
      {
        ...assets,
        'src/index.ht.js': page('<link rel="stylesheet" href="/repo/site.css" vite-ignore>'),
      },
      '/repo/',
    );

    expect(site.read('index.html')).toContain('<link rel="stylesheet" href="/repo/site.css">');
    expect(site.has('site.css')).toBe(true);
  }, 30_000);

  it('matches externalAssets against the URL less its base', async () => {
    const site = await buildSite(
      {
        'src/index.ht.js': page(
          '<link rel="stylesheet" href="/su/ui.css"><script type="module" src="/su/boot.js"></script>',
          `<button onclick="import('/repo/su/menu.js')">Menu</button>`,
        ),
      },
      '/repo/',
      { externalAssets: '/su/' },
    );

    const html = site.read('index.html');

    expect(html).toContain('href="/repo/su/ui.css"');
    expect(html).toContain('src="/repo/su/boot.js"');
    expect(html).toContain(`import('/repo/su/menu.js')`);
  }, 30_000);

  it('gives page modules the base as import.meta.env.BASE_URL', async () => {
    const site = await buildSite(
      {
        'src/index.ht.js':
          'export default () => `<a href="${import.meta.env.BASE_URL}about">About</a>`;\n',
      },
      '/repo/',
    );

    expect(site.read('index.html')).toContain('<a href="/repo/about">About</a>');
  }, 30_000);

  it('changes nothing without a base', async () => {
    const site = await buildSite(
      {
        ...assets,
        'src/index.ht.js': page('<link rel="stylesheet" href="/site.css">'),
      },
      undefined,
    );

    expect(site.read('index.html')).toContain('<link rel="stylesheet" href="/site.css">');
  }, 30_000);

  it('writes a relative base as the path back to the output root', async () => {
    const site = await buildSite(
      {
        ...assets,
        'src/index.ht.js': page('<link rel="stylesheet" href="/site.css">'),
        'src/blog/post.ht.js': page('<link rel="stylesheet" href="/site.css">'),
      },
      './',
    );

    expect(site.read('index.html')).toContain('href="./site.css"');
    expect(site.read('blog/post/index.html')).toContain('href="../../site.css"');
    expect(site.has('site.css')).toBe(true);
  }, 30_000);
});
