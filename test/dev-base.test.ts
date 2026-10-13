import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import { htPages } from '../src/plugin';

const servers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function serveSite(base: string | undefined) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'htjs-pages-dev-base-'));
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };

  write('package.json', '{"type":"module"}');
  write('src/site.css', 'body { color: red; }\n');
  write(
    'src/index.ht.js',
    'export default () => `<!doctype html><html><head><link rel="stylesheet" href="/site.css"></head><body>home</body></html>`;\n',
  );
  write(
    'src/about.ht.js',
    'export default () => `<!doctype html><html><head></head><body>about <a href="${import.meta.env.BASE_URL}">home</a></body></html>`;\n',
  );

  const server = await createServer({
    root,
    base,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, ws: false },
    plugins: [htPages({ devToolbar: false })],
  });

  servers.push(server);
  await server.listen();

  const { port } = server.httpServer!.address() as AddressInfo;

  return (url: string) =>
    fetch(`http://localhost:${port}${url}`, {
      redirect: 'manual',
      headers: { accept: 'text/html' },
    });
}

describe('dev server under a base', () => {
  it('serves pages under the base, where the build puts them', async () => {
    const get = await serveSite('/repo/');

    const home = await get('/repo/');
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('home');

    const about = await get('/repo/about');
    expect(about.status).toBe(200);
    expect(await about.text()).toContain('about');
  }, 30_000);

  it('gives page modules the base as import.meta.env.BASE_URL', async () => {
    const get = await serveSite('/repo/');

    expect(await (await get('/repo/about')).text()).toContain('<a href="/repo/">home</a>');
  }, 30_000);

  it('writes the page for the root and lets Vite put the base on its assets', async () => {
    const get = await serveSite('/repo/');
    const html = await (await get('/repo/')).text();

    expect(html).toContain('<link rel="stylesheet" href="/repo/src/site.css">');
  }, 30_000);

  it('maps an asset URL under the base onto the pages directory', async () => {
    const get = await serveSite('/repo/');
    const res = await get('/repo/site.css');

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/color:\s*red/);
  }, 30_000);

  it('leaves URLs outside the base to Vite', async () => {
    const get = await serveSite('/repo/');

    // Vite sends the site root to the base...
    const root = await get('/');
    expect(root.status).toBe(302);
    expect(root.headers.get('location')).toBe('/repo/');

    // ...and points anything else at it, as a deployed site would 404.
    const about = await get('/about');
    expect(about.status).toBe(404);
    expect(await about.text()).toContain('/repo/about');
  }, 30_000);

  it('serves pages at the root without a base', async () => {
    const get = await serveSite(undefined);

    const home = await get('/');
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('<link rel="stylesheet" href="/src/site.css">');

    expect((await get('/about')).status).toBe(200);
  }, 30_000);
});
