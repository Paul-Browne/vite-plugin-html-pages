import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { build, type InlineConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import htPages from '../src/plugin';

function makeSite(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-build-'));

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ type: 'module' }),
  );

  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), source);
  }

  return root;
}

async function buildSite(root: string, config: InlineConfig = {}): Promise<void> {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [htPages()],
    ...config,
  });
}

function exists(root: string, file: string): boolean {
  return fs.existsSync(path.join(root, 'dist', file));
}

/** A stand-in for an automatic JSX runtime, whose output is easy to spot. */
function fakeJsxRuntime(name: string): Record<string, string> {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({ name, type: 'module' }),
    [`node_modules/${name}/jsx-runtime.js`]:
      `export const jsx = (type, props) => ({ type, props, runtime: '${name}' });\n` +
      'export const jsxs = jsx;\n' +
      "export const Fragment = 'fragment';\n",
  };
}

function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, 'dist', file), 'utf8');
}

/** A built script and the chunks it imports, where shared code such as a JSX runtime ends up. */
function readBundled(root: string, file: string): string {
  const code = read(root, file);
  const chunks = [...code.matchAll(/from\s*"(\.{1,2}\/[^"]+)"/g)].map((match) =>
    read(root, path.posix.join(path.posix.dirname(file), match[1])),
  );

  return [code, ...chunks].join('\n');
}

/** Every script and stylesheet URL in a built page, as the browser resolves it. */
function assetPaths(html: string, fileName: string): string[] {
  const page = new URL(fileName, 'http://site.invalid/');
  const urls = [
    ...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g),
    ...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g),
  ].map((match) => match[1]);

  return urls.map((url) => new URL(url, page).pathname);
}

describe('built pages and the assets they reference', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('point at files that exist in dist', async () => {
    const root = makeSite({
      'src/main.ts': 'const greeting: string = "hi";\nconsole.log(greeting);\n',
      'src/lib/util.mjs': 'console.log("util");\n',
      'src/styles.css': 'body { color: red; }\n',
      'src/index.ht.js': `export default () => '<html><head>' +
        '<link rel="stylesheet" href="styles.css">' +
        '<link rel="modulepreload" href="/main.ts">' +
        '<script type="module" src="/main.ts"></script>' +
        '<script type="module" src="lib/util.mjs"></script>' +
        '</head><body></body></html>';`,
      'src/blog/[slug].ht.js': `
        export const generateStaticParams = () => [{ slug: 'hello' }];
        export default () => '<html><head>' +
          '<link rel="stylesheet" href="/styles.css">' +
          '<script type="module" src="../../main.ts?v=1"></script>' +
          '</head><body></body></html>';`,
    });

    await buildSite(root);

    const pages = ['index.html', 'blog/hello/index.html'];

    for (const page of pages) {
      const paths = assetPaths(read(root, page), page);

      expect(paths.length).toBeGreaterThan(0);

      for (const assetPath of paths) {
        expect(
          fs.existsSync(path.join(root, 'dist', assetPath)),
          `${page} references ${assetPath}`,
        ).toBe(true);
      }
    }

    // The URL form survives the rename: relative stays relative, and a
    // query string is kept.
    expect(read(root, 'index.html')).toContain('src="/main.js"');
    expect(read(root, 'index.html')).toContain('href="/main.js"');
    expect(read(root, 'index.html')).toContain('src="lib/util.js"');
    expect(read(root, 'blog/hello/index.html')).toContain(
      'src="../../main.js?v=1"',
    );

    // Compiled, not copied.
    expect(read(root, 'main.js')).not.toContain(': string');
    expect(fs.existsSync(path.join(root, 'dist', 'main.ts'))).toBe(false);
  });

  it('compiles JSX and .mts entries, and withholds code no page references', async () => {
    const root = makeSite({
      ...fakeJsxRuntime('react'),
      'src/island.tsx':
        'const label: string = "island";\nexport const view = <p class="island">{label}</p>;\n',
      'src/widget.jsx': 'export const view = <><p>widget</p></>;\n',
      'src/lib/math.mts': 'export const answer: number = 42;\n',
      // Only the page imports this, at build time; no page references it.
      'src/components/Card.tsx':
        'export const card = (title: string): string => `<div>${title}</div>`;\n',
      'src/server.cjs': 'module.exports = { secret: "do-not-ship" };\n',
      'src/index.ht.js': `import { card } from './components/Card.tsx';
        export default () => '<html><head>' +
          '<script type="module" src="/island.tsx"></script>' +
          '<script type="module" src="widget.jsx"></script>' +
          '<script type="module" src="/lib/math.mts"></script>' +
          '</head><body>' + card('hello') + '</body></html>';`,
    });

    await buildSite(root);

    const html = read(root, 'index.html');

    expect(html).toContain('src="/island.js"');
    expect(html).toContain('src="widget.js"');
    expect(html).toContain('src="/lib/math.js"');
    expect(html).toContain('<div>hello</div>');

    for (const assetPath of assetPaths(html, 'index.html')) {
      expect(exists(root, assetPath), `index.html references ${assetPath}`).toBe(true);
    }

    // Automatic runtime, as the dev server compiles it, rather than
    // esbuild's own default of React.createElement.
    expect(readBundled(root, 'island.js')).toContain('runtime:"react"');
    expect(readBundled(root, 'island.js')).not.toContain('createElement');
    expect(readBundled(root, 'widget.js')).toContain('runtime:"react"');
    expect(read(root, 'lib/math.js')).not.toContain(': number');

    for (const source of ['island.tsx', 'widget.jsx', 'lib/math.mts']) {
      expect(exists(root, source), `${source} copied as is`).toBe(false);
    }

    for (const unshipped of [
      'components/Card.tsx',
      'components/Card.js',
      'server.cjs',
      'server.js',
    ]) {
      expect(exists(root, unshipped), `${unshipped} shipped`).toBe(false);
    }
  });

  it('compiles JSX with the runtime the Vite config gives the dev server', async () => {
    const root = makeSite({
      ...fakeJsxRuntime('tiny-jsx'),
      'src/island.tsx': 'export const view = <p>island</p>;\n',
      'src/index.ht.js': `export default () =>
        '<html><head><script type="module" src="/island.tsx"></script></head></html>';`,
    });

    await buildSite(root, { oxc: { jsx: { importSource: 'tiny-jsx' } } });

    expect(readBundled(root, 'island.js')).toContain('runtime:"tiny-jsx"');
  });

  it('fails when a page loads CommonJS, which the build never emits', async () => {
    const root = makeSite({
      'src/legacy.cjs': 'module.exports = {};\n',
      'src/index.ht.js': `export default () =>
        '<html><head><script src="/legacy.cjs"></script></head></html>';`,
    });

    await expect(buildSite(root)).rejects.toThrow(
      /src\/legacy\.cjs is CommonJS, which browsers can't load/,
    );
  });

  it('fails when a nested page uses a relative URL meant for the site root', async () => {
    const root = makeSite({
      'src/styles.css': 'body { color: red; }\n',
      'src/blog/[slug].ht.js': `
        export const generateStaticParams = () => [{ slug: 'hello' }];
        export default () => '<html><head>' +
          '<link rel="stylesheet" href="styles.css">' +
          '</head><body></body></html>';`,
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(buildSite(root)).rejects.toThrow(
      /Resolves to \/blog\/hello\/styles\.css[\s\S]*Did you mean "\/styles\.css"\?/,
    );
  });
});
