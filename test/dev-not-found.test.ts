import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { createServer, type AppType, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { htPages } from '../src/plugin';
import type { HtPagesPluginOptions } from '../src/types';

const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const layout = `export const layout = (body) => \`<!doctype html><html><head><link rel="stylesheet" href="/site.css"></head><body><header>Site header</header>\${body}</body></html>\`;\n`;

const page = (body: string) =>
  `import { layout } from './layout.js';\nexport default () => layout(\`${body}\`);\n`;

const site: Record<string, string> = {
  'package.json': '{"type":"module"}',
  'public/robots.txt': 'User-agent: *\n',
  'src/site.css': 'body { color: red; }\n',
  'src/layout.js': layout,
  'src/index.ht.js': page('home'),
  'src/404.ht.js': page('<h1>Lost</h1>'),
  // A dynamic route, which renders for any slug in dev, and whose data
  // fails for this one.
  'src/blog/[slug].ht.js': `import { layout } from '../layout.js';
export default {
  data: ({ params }) => {
    if (params.slug === 'broken') throw new Error('No such post: broken');
    return { title: params.slug };
  },
  render: ({ data }) => layout(\`<h1>\${data.title}</h1>\`),
};
`,
};

async function serveSite({
  files = site,
  base,
  appType,
  options = { devToolbar: false },
}: {
  files?: Record<string, string | null>;
  base?: string;
  appType?: AppType;
  options?: HtPagesPluginOptions;
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-dev-404-'));

  for (const [file, content] of Object.entries({ ...site, ...files })) {
    if (content === null) continue;

    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  const server = await createServer({
    root,
    base,
    appType,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, ws: false },
    plugins: [htPages(options)],
  });

  servers.push(server);
  await server.listen();

  const { port } = server.httpServer!.address() as AddressInfo;

  return (url: string, accept = 'text/html') =>
    fetch(`http://localhost:${port}${url}`, {
      redirect: 'manual',
      headers: { accept },
    });
}

describe('a miss in the dev server', () => {
  it('gets the site’s 404 page, with a 404', async () => {
    const get = await serveSite();

    for (const url of ['/no-such-page', '/no/such/page', '/no-such-page/', '/no-such-page?x=1']) {
      const res = await get(url);

      expect(res.status, url).toBe(404);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');

      const html = await res.text();

      expect(html).toContain('<h1>Lost</h1>');
      // Through the same pipeline as any page: its layout, Vite's client
      // for reloads, and the root asset URL mapped onto the pages dir.
      expect(html).toContain('<header>Site header</header>');
      expect(html).toContain('/@vite/client');
      expect(html).toContain('href="/src/site.css"');
    }
  }, 30_000);

  it('carries the dev toolbar, as a page does', async () => {
    const get = await serveSite({ options: {} });
    const html = await (await get('/no-such-page')).text();

    expect(html).toContain('<h1>Lost</h1>');
    expect(html).toContain('data-html-pages-dev-toolbar');
  }, 30_000);

  it('leaves the 404 page itself at /404, as a host serves 404.html', async () => {
    const get = await serveSite();
    const res = await get('/404');

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<h1>Lost</h1>');
  }, 30_000);

  it('gets the build’s default 404 page when the site has none', async () => {
    const get = await serveSite({ files: { 'src/404.ht.js': null } });
    const res = await get('/no-such-page');

    expect(res.status).toBe(404);

    const html = await res.text();

    expect(html).toContain('<title>404 - Page Not Found</title>');
    expect(html).toContain('<a href="/">Go back home</a>');
    expect(html).toContain('/@vite/client');
  }, 30_000);

  it('gets the 404 page under a base, and leaves URLs outside it to Vite', async () => {
    const get = await serveSite({ base: '/repo/' });

    const miss = await get('/repo/no-such-page');
    expect(miss.status).toBe(404);
    expect(await miss.text()).toContain('<h1>Lost</h1>');

    // Vite's own answer, pointing at the base.
    const outside = await get('/no-such-page');
    expect(outside.status).toBe(404);
    expect(await outside.text()).not.toContain('Lost');
  }, 30_000);

  it('links the default 404 page home under a base', async () => {
    const get = await serveSite({
      base: '/repo/',
      files: { 'src/404.ht.js': null },
    });

    const html = await (await get('/repo/no-such-page')).text();

    expect(html).toContain('<a href="/repo/">Go back home</a>');
  }, 30_000);

  it('is answered whatever the request accepts, as a static host does', async () => {
    const get = await serveSite();
    const res = await get('/api/no-such-thing', 'application/json');

    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<h1>Lost</h1>');
  }, 30_000);
});

describe('what the dev server 404 leaves alone', () => {
  it('serves pages, assets and public files as before', async () => {
    const get = await serveSite();

    const home = await get('/');
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('home');

    const css = await get('/site.css', 'text/css');
    expect(css.status).toBe(200);
    expect(await css.text()).toMatch(/color:\s*red/);

    const robots = await get('/robots.txt', 'text/plain');
    expect(robots.status).toBe(200);
    expect(await robots.text()).toBe('User-agent: *\n');

    const post = await get('/blog/hello');
    expect(post.status).toBe(200);
    expect(await post.text()).toContain('<h1>hello</h1>');
  }, 30_000);

  it('leaves a missing asset with Vite’s bare 404', async () => {
    const get = await serveSite();

    for (const url of ['/missing.css', '/images/missing.png', '/missing.js']) {
      const res = await get(url, '*/*');

      expect(res.status, url).toBe(404);
      expect(await res.text(), url).not.toContain('Lost');
    }
  }, 30_000);

  it('leaves Vite’s own URLs to Vite', async () => {
    const get = await serveSite();

    const client = await get('/@vite/client', '*/*');
    expect(client.status).toBe(200);
    expect(client.headers.get('content-type')).toMatch(/javascript/);

    for (const url of ['/@vite/no-such-module', '/@id/no-such-module', '/@fs/no/such/file']) {
      const res = await get(url, '*/*');

      expect(await res.text(), url).not.toContain('Lost');
    }
  }, 30_000);

  it('shows the error overlay for a dynamic route whose data throws', async () => {
    const get = await serveSite();
    const res = await get('/blog/broken');

    expect(res.status).toBe(500);

    const html = await res.text();

    expect(html).toContain('No such post: broken');
    expect(html).toContain('ErrorOverlay');
    expect(html).not.toContain('Lost');
  }, 30_000);

  it('leaves an index.html beside the pages to Vite', async () => {
    const get = await serveSite({
      files: {
        'src/index.ht.js': null,
        'index.html': '<!doctype html><html><head></head><body>Vite index</body></html>',
      },
    });

    const res = await get('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Vite index');
  }, 30_000);

  it('leaves a miss alone with appType custom, for the server it is mounted in', async () => {
    const get = await serveSite({ appType: 'custom' });
    const res = await get('/no-such-page');

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('Lost');
  }, 30_000);
});
