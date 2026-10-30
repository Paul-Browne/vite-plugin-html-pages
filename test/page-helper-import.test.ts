import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { build, createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { htPages } from '../src/plugin';

const packageRoot = path.resolve(__dirname, '..');
const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

// The helpers the README documents, imported from JS and TS pages, with and
// without a route param.
const files: Record<string, string> = {
  'package.json': '{"type":"module"}',
  'src/index.ht.js': `import { definePage } from 'vite-plugin-html-pages/page';

export default definePage(() => '<!doctype html><html><head></head><body>js page</body></html>');
`,
  'src/blog/[slug].ht.ts': `import { definePageModule, type PageParams } from 'vite-plugin-html-pages/page';

const title = (params: PageParams): string => String(params.slug);

export default definePageModule({
  generateStaticParams: () => [{ slug: 'hello' }],
  data: ({ params }) => ({ title: title(params) }),
  render: ({ data }) =>
    \`<!doctype html><html><head></head><body>ts page \${data.title}</body></html>\`,
});
`,
  // The `$types` declarations typegen writes are for the editor, but a page
  // that imports helpers from them at runtime gets the same helpers.
  'src/about.ht.ts': `import { defineData, definePage } from './$types';

export const data = defineData(() => ({ n: 1 }));
export default definePage(({ data }) =>
  \`<!doctype html><html><head></head><body>about \${(data as { n: number }).n}</body></html>\`);
`,
};

/**
 * `installed` puts the package in the site's node_modules, where Vite's own
 * resolver finds it. Without it, as for a dependency of a dependency under
 * pnpm, only the plugin can resolve the import.
 */
function makeSite(installed: boolean): string {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-helper-')),
  );

  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  if (installed) {
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.symlinkSync(
      packageRoot,
      path.join(root, 'node_modules/vite-plugin-html-pages'),
      'dir',
    );
  }

  return root;
}

async function buildSite(installed: boolean) {
  const root = makeSite(installed);

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

async function serveSite(installed: boolean) {
  const root = makeSite(installed);
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

  return async (url: string) => {
    const response = await fetch(`http://localhost:${port}${url}`, {
      headers: { accept: 'text/html' },
    });

    return { status: response.status, body: await response.text() };
  };
}

describe.each([
  ['not resolvable from the site', false],
  ['installed in the site', true],
])("pages importing 'vite-plugin-html-pages/page', %s", (_, installed) => {
  it('build', async () => {
    const read = await buildSite(installed);

    expect(read('index.html')).toContain('js page');
    expect(read('blog/hello/index.html')).toContain('ts page hello');
    expect(read('about/index.html')).toContain('about 1');
  }, 30_000);

  it('serve in dev', async () => {
    const get = await serveSite(installed);

    expect(await get('/')).toMatchObject({
      status: 200,
      body: expect.stringContaining('js page'),
    });
    expect(await get('/blog/hello')).toMatchObject({
      status: 200,
      body: expect.stringContaining('ts page hello'),
    });
    expect(await get('/about')).toMatchObject({
      status: 200,
      body: expect.stringContaining('about 1'),
    });
  }, 30_000);
});
