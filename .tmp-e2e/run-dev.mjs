import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.mjs'),
  logLevel: 'error',
  server: { port: 5199 },
});

await server.listen();

async function get(url) {
  const res = await fetch(`http://localhost:5199${url}`);
  const body = await res.text();
  const match = body.match(/<p>[^<]*<\/p>/);
  console.log(`${url} -> ${res.status} ${match ? match[0] : '(no page content)'}`);
}

await get('/blog/listed');
await get('/blog/on-demand');
await get('/docs/api/auth');
await get('/nope/missing');

await server.close();
console.log('DEV_CHECK_DONE');
