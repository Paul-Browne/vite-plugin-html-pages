import { describe, expect, it } from 'vitest';

import { renderPage } from '../src/render-runtime';
import type { HtPageInfo, HtPageModule } from '../src/types';

function makePage(overrides: Partial<HtPageInfo> = {}): HtPageInfo {
  return {
    id: '/project/src/index.ht.js',
    entryPath: '/project/src/index.ht.js',
    absolutePath: '/project/src/index.ht.js',
    relativePath: 'src/index.ht.js',
    routePattern: '/',
    routePath: '/',
    fileName: 'index.html',
    dynamic: false,
    paramNames: [],
    paramDefinitions: [],
    params: {},
    ...overrides,
  };
}

describe('renderPage', () => {
  it('renders a string default export', async () => {
    const html = await renderPage(makePage(), {
      default: '<p>hello</p>',
    });

    expect(html).toBe('<p>hello</p>');
  });

  it('prepends a doctype to full-document output', async () => {
    const html = await renderPage(makePage(), {
      default: '<html><body>hi</body></html>',
    });

    expect(html).toBe('<!DOCTYPE html><html><body>hi</body></html>');
  });

  it('keeps an existing doctype untouched', async () => {
    const source = '<!doctype html><html><body>hi</body></html>';

    const html = await renderPage(makePage(), { default: source });

    expect(html).toBe(source);
  });

  it('calls a function default export with the render context', async () => {
    const page = makePage({
      routePath: '/blog/hello',
      params: { slug: 'hello' },
    });

    const html = await renderPage(
      page,
      {
        default: (ctx) => `<p>${ctx.params.slug}:${ctx.dev}</p>`,
      },
      true,
    );

    expect(html).toBe('<p>hello:true</p>');
  });

  it('passes the data() result into the render context', async () => {
    const html = await renderPage(makePage(), {
      data: async () => ({ title: 'Data' }),
      default: (ctx) => `<h1>${(ctx.data as { title: string }).title}</h1>`,
    });

    expect(html).toBe('<h1>Data</h1>');
  });

  it('supports structured default exports', async () => {
    const html = await renderPage(makePage(), {
      default: {
        data: () => 'from-data',
        render: (ctx) => `<p>${ctx.data}</p>`,
      },
    });

    expect(html).toBe('<p>from-data</p>');
  });

  it('throws when the default export is missing', async () => {
    await expect(renderPage(makePage(), {} as HtPageModule)).rejects.toThrow(
      /does not export a default renderer/,
    );
  });

  it('wraps render errors with page context', async () => {
    const page = makePage({ routePath: '/broken' });

    await expect(
      renderPage(page, {
        default: () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow(/Failed to render "src\/index\.ht\.js".*boom/);
  });

  it('throws when a page render returns undefined', async () => {
    await expect(
      renderPage(makePage(), {
        default: () => undefined as unknown as string,
      }),
    ).rejects.toThrow(/received undefined/);
  });

  it('throws when a page render returns null', async () => {
    await expect(
      renderPage(makePage(), {
        default: () => null as unknown as string,
      }),
    ).rejects.toThrow(/received null/);
  });

  it('rejects non-string results when react is unavailable', async () => {
    // react is not installed in this repo, so a non-string render result
    // must fail loudly instead of being emitted.
    await expect(
      renderPage(makePage(), {
        default: () => 42 as unknown as string,
      }),
    ).rejects.toThrow(/Failed to render/);
  });
});
