import { describe, expect, it } from 'vitest';

import { collectLocalAssetUrls } from '../src/html-asset-validator';

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
