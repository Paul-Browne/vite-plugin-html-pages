import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  collectLocalAssetUrls,
  rewriteCompiledAssetUrls,
  validateHtmlAssetReferences,
} from '../src/html-asset-validator';

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  return root;
}

function validationError(run: () => void): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error('expected validation to fail');
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

  it('resolves a relative stylesheet against the page, not the site root', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'styles.css'), 'body{}');

    const html = '<link rel="stylesheet" href="styles.css">';

    // From the root page it reaches src/styles.css...
    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html,
        pluginName: 'test',
        pageFileName: 'index.html',
      }),
    ).not.toThrow();

    // ...but a browser on /blog/hello/ asks for /blog/hello/styles.css.
    const message = validationError(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html,
        pluginName: 'test',
        pageLabel: 'src/blog/[slug].ht.js',
        pageFileName: 'blog/hello/index.html',
      }),
    );

    expect(message).toContain('Missing stylesheet asset (src/blog/[slug].ht.js): styles.css');
    expect(message).toContain('Resolves to /blog/hello/styles.css from /blog/hello/index.html');
    expect(message).toContain(path.join(root, 'src', 'blog', 'hello', 'styles.css'));
    expect(message).toContain('Did you mean "/styles.css"?');
  });

  it('accepts a relative URL to a file beside the page', () => {
    const root = makeFixtureRoot();
    fs.mkdirSync(path.join(root, 'src', 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'docs', 'docs.css'), 'body{}');
    fs.writeFileSync(path.join(root, 'src', 'docs', 'docs.js'), '');

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<link rel="stylesheet" href="./docs.css"><script src="../docs/docs.js"></script>',
        pluginName: 'test',
        pageFileName: 'docs/index.html',
      }),
    ).not.toThrow();
  });

  it('resolves relative URLs against <base href> when the page has one', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'styles.css'), 'body{}');

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<base href="/"><link rel="stylesheet" href="styles.css">',
        pluginName: 'test',
        pageFileName: 'blog/hello/index.html',
      }),
    ).not.toThrow();
  });

  it('points a compiled output name back at its source', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'main.ts'), 'export {}');

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script type="module" src="/main.ts"></script>',
        pluginName: 'test',
      }),
    ).not.toThrow();

    // The dev server has no /main.js to serve, so neither should the build.
    const message = validationError(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script type="module" src="/main.js?v=2"></script>',
        pluginName: 'test',
      }),
    );

    expect(message).toContain('Missing JavaScript asset: /main.js?v=2');
    expect(message).toContain('Did you mean "/main.ts?v=2"?');
  });

  it('points a compiled output name back at a JSX source', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'island.tsx'), 'export {}');

    const message = validationError(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script type="module" src="/island.js"></script>',
        pluginName: 'test',
      }),
    );

    expect(message).toContain('Did you mean "/island.tsx"?');
  });

  it('rejects a CommonJS script, which the build never emits', () => {
    const root = makeFixtureRoot();
    fs.writeFileSync(path.join(root, 'src', 'legacy.cjs'), 'module.exports = {}');

    const message = validationError(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script src="/legacy.cjs"></script>',
        pluginName: 'test',
      }),
    );

    expect(message).toContain('Missing JavaScript asset: /legacy.cjs');
    expect(message).toContain("src/legacy.cjs is CommonJS, which browsers can't load");
  });

  it('accepts a CommonJS script shipped from public/', () => {
    const root = makeFixtureRoot();
    fs.mkdirSync(path.join(root, 'public'));
    fs.writeFileSync(path.join(root, 'public', 'vendor.cjs'), '');

    expect(() =>
      validateHtmlAssetReferences({
        root,
        pagesDir: 'src',
        html: '<script src="/vendor.cjs"></script>',
        pluginName: 'test',
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

  it('ignores external, protocol-relative, and non-http urls', () => {
    const html = `
      <script src="https://cdn.example.com/lib.js"></script>
      <script src="//cdn.example.com/lib2.js"></script>
      <img src="data:image/png;base64,AAAA">
      <a href="mailto:hi@example.com">Mail</a>
      <a href="#top">Top</a>
      <a href="/about">About</a>
    `;

    expect(collectLocalAssetUrls(html)).toEqual(['/about']);
  });

  it('resolves relative urls against the page they appear on', () => {
    const html = `
      <link rel="stylesheet" href="styles.css">
      <script src="./local.js"></script>
      <link rel="stylesheet" href="../shared.css">
    `;

    expect(collectLocalAssetUrls(html, 'blog/hello/index.html')).toEqual([
      '/blog/hello/styles.css',
      '/blog/hello/local.js',
      '/blog/shared.css',
    ]);

    expect(collectLocalAssetUrls(html, 'about.html')).toEqual([
      '/styles.css',
      '/local.js',
      '/shared.css',
    ]);
  });

  it('decodes percent-encoded paths so they match file names', () => {
    const html = `<script src="/my%20script.js"></script>`;

    expect(collectLocalAssetUrls(html)).toEqual(['/my script.js']);
  });

  it('deduplicates repeated references', () => {
    const html = `
      <script src="/main.js"></script>
      <script src="/main.js"></script>
    `;

    expect(collectLocalAssetUrls(html)).toEqual(['/main.js']);
  });
});

describe('rewriteCompiledAssetUrls', () => {
  const outputs = new Map([
    ['/main.ts', '/main.js'],
    ['/blog/widget.ts', '/blog/widget.js'],
    ['/lib/util.mjs', '/lib/util.js'],
    ['/lib/math.mts', '/lib/math.js'],
    ['/island.tsx', '/island.js'],
  ]);

  it('points script tags, preloads and dynamic imports at the output', () => {
    const html = `
      <link rel="modulepreload" href="/main.ts">
      <script type="module" src="/main.ts?v=3"></script>
      <script type='module' src='/lib/util.mjs'></script>
      <script type="module" src="/lib/math.mts"></script>
      <script type="module" src="/island.tsx"></script>
      <script type="module">import('/main.ts').then((m) => m.init());</script>
    `;

    expect(rewriteCompiledAssetUrls(html, 'index.html', outputs)).toBe(`
      <link rel="modulepreload" href="/main.js">
      <script type="module" src="/main.js?v=3"></script>
      <script type='module' src='/lib/util.js'></script>
      <script type="module" src="/lib/math.js"></script>
      <script type="module" src="/island.js"></script>
      <script type="module">import('/main.js').then((m) => m.init());</script>
    `);
  });

  it('keeps relative urls relative', () => {
    const html = `<script src="widget.ts"></script><script src="../main.ts#x"></script>`;

    expect(rewriteCompiledAssetUrls(html, 'blog/index.html', outputs)).toBe(
      `<script src="widget.js"></script><script src="../main.js#x"></script>`,
    );
  });

  it('leaves code samples and unrelated urls alone', () => {
    const html = `
      <pre><code>&lt;script src="/main.ts"&gt;&lt;/script&gt;</code></pre>
      <p>Call <code>import('/main.ts')</code> to load it.</p>
      <script src="/other.ts"></script>
      <script src="https://cdn.example.com/main.ts"></script>
      <script src="widget.ts"></script>
    `;

    // widget.ts resolves to /widget.ts from the root page, not /blog/widget.ts.
    expect(rewriteCompiledAssetUrls(html, 'index.html', outputs)).toBe(html);
  });
});
