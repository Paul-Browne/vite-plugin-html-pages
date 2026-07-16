import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

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
