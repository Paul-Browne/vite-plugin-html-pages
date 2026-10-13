import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { build } from 'vite';
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

async function buildSite(root: string): Promise<void> {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [htPages()],
  });
}

function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, 'dist', file), 'utf8');
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
