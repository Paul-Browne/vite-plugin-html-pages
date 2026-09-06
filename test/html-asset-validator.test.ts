import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  collectLocalAssetUrls,
  validateHtmlAssetReferences,
} from '../src/html-asset-validator';

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  return root;
}

describe('validateHtmlAssetReferences', () => {
  it('detects missing stylesheets regardless of attribute order', () => {
    const root = makeFixtureRoot();

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<link href="/missing.css" rel="stylesheet">',
        pluginName: 'test',
        missingAssets: 'error',
      }),
    ).toThrow(/missing\.css/);
  });

  it('accepts stylesheets that exist, href-first or rel-first', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'styles.css'), 'body{}');

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: `
          <link href="/styles.css" rel="stylesheet">
          <link rel="stylesheet" href="/styles.css">
        `,
        pluginName: 'test',
        missingAssets: 'error',
      }),
    ).not.toThrow();
  });

  it('detects missing script sources', () => {
    const root = makeFixtureRoot();

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script src="/missing.js"></script>',
        pluginName: 'test',
        missingAssets: 'error',
      }),
    ).toThrow(/missing\.js/);
  });

  it('exempts externalAssets from the missing-asset check', () => {
    const root = makeFixtureRoot();

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: `
          <script src="/su/boot.js"></script>
          <link rel="stylesheet" href="/su/theme.css">
        `,
        pluginName: 'test',
        missingAssets: 'error',
        externalAssets: '/su/',
      }),
    ).not.toThrow();
  });

  it('silences the literal dynamic import warning for externalAssets', () => {
    const root = makeFixtureRoot();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: `<button onclick="import('/su/alert.js').then(m=>m.dismiss(this))"></button>`,
        pluginName: 'test',
        missingAssets: 'error',
        externalAssets: ['/su/'],
      });

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('still warns for a literal dynamic import outside externalAssets', () => {
    const root = makeFixtureRoot();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: `<button onclick="import('/other/alert.js').then(m=>m.dismiss(this))"></button>`,
        pluginName: 'test',
        missingAssets: 'error',
        externalAssets: ['/su/'],
      });

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/\/other\/alert\.js/);
    } finally {
      warn.mockRestore();
    }
  });

  it('treats an entry without a trailing slash as an exact match', () => {
    const root = makeFixtureRoot();

    // The exact URL is exempt...
    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script src="/su.js"></script>',
        pluginName: 'test',
        missingAssets: 'error',
        externalAssets: '/su.js',
      }),
    ).not.toThrow();

    // ...but a URL that merely starts with it is not.
    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script src="/su.js.map.js"></script>',
        pluginName: 'test',
        missingAssets: 'error',
        externalAssets: '/su.js',
      }),
    ).toThrow(/su\.js\.map\.js/);
  });

  it('accepts an externalAssets entry written without a leading slash', () => {
    const root = makeFixtureRoot();

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script src="/su/boot.js"></script>',
        pluginName: 'test',
        missingAssets: 'error',
        externalAssets: 'su/',
      }),
    ).not.toThrow();
  });

  it('exempts an external asset carrying a query string', () => {
    const root = makeFixtureRoot();

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script src="/su/boot.js?v=2"></script>',
        pluginName: 'test',
        missingAssets: 'error',
        externalAssets: '/su/',
      }),
    ).not.toThrow();
  });
})

describe('collectLocalAssetUrls', () => {
  it('collects root-relative href and src urls', () => {
    const html = `
      <link rel="stylesheet" href="/styles.css">
      <link href="/reversed.css" rel="stylesheet">
      <script src="/main.js"></script>
      <img src="/logo.png">
    `;

    expect(collectLocalAssetUrls(html).sort()).toEqual([
      '/logo.png',
      '/main.js',
      '/reversed.css',
      '/styles.css',
    ]);
  });

  it('collects literal dynamic imports from inline scripts', () => {
    const html = `<script type="module">import('/widgets/chart.js');</script>`;

    expect(collectLocalAssetUrls(html)).toEqual(['/widgets/chart.js']);
  });

  it('ignores dynamic imports inside code samples', () => {
    const html = `
      <p>See <code>import('/js/todo.js')</code> in the docs.</p>
      <pre><code>body onload="import('/js/todo.js').then(…)"</code></pre>
      <body onload="import('/app.js').then((m) => m.init())"></body>
    `;

    expect(collectLocalAssetUrls(html)).toEqual(['/app.js']);
  });

  it('strips query strings and hashes', () => {
    const html = `<script src="/main.js?v=3#x"></script>`;

    expect(collectLocalAssetUrls(html)).toEqual(['/main.js']);
  });

  it('ignores external, protocol-relative, and relative urls', () => {
    const html = `
      <script src="https://cdn.example.com/lib.js"></script>
      <script src="//cdn.example.com/lib2.js"></script>
      <script src="./local.js"></script>
      <a href="/about">About</a>
    `;

    expect(collectLocalAssetUrls(html)).toEqual(['/about']);
  });

  it('deduplicates repeated references', () => {
    const html = `
      <script src="/main.js"></script>
      <script src="/main.js"></script>
    `;

    expect(collectLocalAssetUrls(html)).toEqual(['/main.js']);
  });
});
