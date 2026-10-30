import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { build, createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { htPages } from '../src/plugin';

const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/*
 * `[...path]?` is the one page name with a `?` in it, which Vite reads
 * as the start of a query. The page imports a module by a relative
 * path, which has to resolve from the page's real directory.
 */
const catchAllPage = (label: string) => `
import { section } from '../section.js';

export const generateStaticParams = () => [
  { path: [] },
  { path: ['a'] },
  { path: ['a', 'b'] },
];

export default ({ params }) =>
  \`<!doctype html><html><head></head><body>${label} \${section}:\${(params.path ?? []).join('/') || '(root)'}</body></html>\`;
`;

function writeSite(files: Record<string, string>): string {
  // The real path, so the watcher's paths match the root's.
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-catch-all-')),
  );

  const all: Record<string, string> = {
    'package.json': '{"type":"module"}',
    'src/index.ht.js':
      'export default () => `<!doctype html><html><head></head><body>home</body></html>`;\n',
    'src/section.js': 'export const section = "x";\n',
    ...files,
  };

  for (const [file, content] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  return root;
}

async function buildSite(files: Record<string, string>) {
  const root = writeSite(files);

  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [htPages({ devToolbar: false })],
    build: { outDir: 'dist', emptyOutDir: true },
  });

  return (fileName: string) =>
    fs.readFileSync(path.join(root, 'dist', fileName), 'utf8');
}

async function serveSite(files: Record<string, string>) {
  const root = writeSite(files);

  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, ws: false },
    plugins: [htPages({ devToolbar: false })],
  });

  servers.push(server);
  await server.listen();

  const { port } = server.httpServer!.address() as AddressInfo;

  return {
    root,
    get: async (url: string) => {
      const res = await fetch(`http://localhost:${port}${url}`, {
        headers: { accept: 'text/html' },
      });

      return { status: res.status, text: await res.text() };
    },
  };
}

describe('optional catch-all pages', () => {
  it('builds every route from one [...path]?.ht.js', async () => {
    const read = await buildSite({
      'src/x/[...path]?.ht.js': catchAllPage('js'),
    });

    expect(read('x/index.html')).toContain('js x:(root)');
    expect(read('x/a/index.html')).toContain('js x:a');
    expect(read('x/a/b/index.html')).toContain('js x:a/b');
  }, 30_000);

  it('builds a TypeScript one through the usual transforms', async () => {
    const read = await buildSite({
      'src/x/[...path]?.ht.ts': catchAllPage('ts').replace(
        '({ params })',
        '({ params }: { params: { path?: string[] } })',
      ),
    });

    expect(read('x/a/b/index.html')).toContain('ts x:a/b');
  }, 30_000);

  it('serves every route from one [...path]?.ht.js in dev', async () => {
    const { get } = await serveSite({
      'src/x/[...path]?.ht.js': catchAllPage('js'),
    });

    for (const [url, expected] of [
      ['/x', 'js x:(root)'],
      ['/x/a', 'js x:a'],
      ['/x/a/b', 'js x:a/b'],
      // Not listed by generateStaticParams; dev renders it anyway.
      ['/x/c/d/e', 'js x:c/d/e'],
    ]) {
      const res = await get(url);

      expect(res.status, url).toBe(200);
      expect(res.text, url).toContain(expected);
    }
  }, 30_000);

  it('picks up an edit to the page in dev', async () => {
    // Vite's module graph only knows the page by its escaped id, so
    // nothing ties a change on disk to the loaded module unless the
    // plugin does.
    const { root, get } = await serveSite({
      'src/x/[...path]?.ht.js': catchAllPage('before'),
    });

    expect((await get('/x/a')).text).toContain('before x:a');

    fs.writeFileSync(
      path.join(root, 'src/x/[...path]?.ht.js'),
      catchAllPage('after'),
    );

    let text = '';

    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      text = (await get('/x/a')).text;
      if (text.includes('after')) break;
    }

    expect(text).toContain('after x:a');
  }, 30_000);
});
