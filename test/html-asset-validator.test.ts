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

describe('validateHtmlAssetReferences under a base', () => {
  const base = '/repo/';

  function validate(html: string, extra: { root?: string; externalAssets?: string | string[]; base?: string } = {}) {
    const root = extra.root ?? makeFixtureRoot();

    validateHtmlAssetReferences({
      root,
      pagesDir: 'src',
      html,
      pluginName: 'test',
      missingAssets: 'error',
      externalAssets: extra.externalAssets,
      base: extra.base ?? base,
    });
  }

  it('takes the base off before looking for the file', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'site.css'), 'body{}');
    fs.mkdirSync(path.join(root, 'public'));
    fs.writeFileSync(path.join(root, 'public', 'app.js'), '');

    expect(() =>
      validate(
        `<link rel="stylesheet" href="/repo/site.css">
         <script src="/repo/app.js?v=1"></script>`,
        { root },
      ),
    ).not.toThrow();
  });

  it('reports a missing asset by the URL the page has, and the paths it looked at', () => {
    const root = makeFixtureRoot();
    let message = '';

    try {
      validate('<link rel="stylesheet" href="/repo/missing.css">', { root });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('Missing stylesheet asset: /repo/missing.css');
    expect(message).toContain(path.join(root, 'src', 'missing.css'));
    expect(message).toContain(path.join(root, 'public', 'missing.css'));
    expect(message).not.toContain(path.join('src', 'repo'));
  });

  it('points out a base written in by hand, which ends up there twice', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'site.css'), 'body{}');

    expect(() =>
      validate('<link rel="stylesheet" href="/repo/repo/site.css">', { root }),
    ).toThrow(/base \(\/repo\/\) twice[\s\S]*Write "\/site\.css"/);
  });

  it('still checks a URL that does not carry the base', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'site.css'), 'body{}');

    // Not rebased (say, written into an event handler), so it is read
    // as root-relative: present, and so accepted...
    expect(() =>
      validate('<link rel="stylesheet" href="/site.css">', { root }),
    ).not.toThrow();

    // ...or missing, and reported.
    expect(() =>
      validate('<script src="/gone.js"></script>', { root }),
    ).toThrow(/gone\.js/);
  });

  it('matches externalAssets, written for the root, against the URL less its base', () => {
    expect(() =>
      validate(
        `<script src="/repo/su/boot.js"></script>
         <link rel="stylesheet" href="/repo/su/theme.css">`,
        { externalAssets: '/su/' },
      ),
    ).not.toThrow();
  });

  it('matches an exact externalAssets entry under a base', () => {
    expect(() =>
      validate('<script src="/repo/su.js"></script>', { externalAssets: '/su.js' }),
    ).not.toThrow();

    expect(() =>
      validate('<script src="/repo/su.js.map.js"></script>', { externalAssets: '/su.js' }),
    ).toThrow(/su\.js\.map\.js/);
  });

  it('silences the dynamic import warning for externalAssets under a base', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      validate(
        `<button onclick="import('/repo/su/alert.js').then(m=>m.dismiss(this))"></button>`,
        { externalAssets: ['/su/'] },
      );

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('does not let an externalAssets entry match the base itself', () => {
    // `/repo/` as written would cover everything under the base once the
    // base is off — it has to be read as a root path.
    expect(() =>
      validate('<script src="/repo/missing.js"></script>', { externalAssets: '/repo/' }),
    ).toThrow(/missing\.js/);
  });

  it('takes off a full URL base', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'site.css'), 'body{}');

    expect(() =>
      validate('<link rel="stylesheet" href="https://cdn.example.com/repo/site.css">', {
        root,
        base: 'https://cdn.example.com/repo/',
      }),
    ).not.toThrow();

    expect(() =>
      validate('<link rel="stylesheet" href="https://cdn.example.com/repo/gone.css">', {
        root,
        base: 'https://cdn.example.com/repo/',
      }),
    ).toThrow(/gone\.css/);
  });

  it('takes off a relative page base', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'site.css'), 'body{}');

    expect(() =>
      validate('<link rel="stylesheet" href="../../site.css">', { root, base: '../../' }),
    ).not.toThrow();
  });
});

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

  it('takes the base off before collecting', () => {
    const html = `
      <link rel="stylesheet" href="/repo/styles.css?v=2">
      <script src="/repo/main.js"></script>
      <button onclick="import('/repo/widgets/chart.js')"></button>
      <a href="/elsewhere">Out</a>
    `;

    expect(collectLocalAssetUrls(html, '/repo/').sort()).toEqual([
      '/elsewhere',
      '/main.js',
      '/styles.css',
      '/widgets/chart.js',
    ]);
  });

  it('deduplicates repeated references', () => {
    const html = `
      <script src="/main.js"></script>
      <script src="/main.js"></script>
    `;

    expect(collectLocalAssetUrls(html)).toEqual(['/main.js']);
  });
});
