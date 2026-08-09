import { describe, expect, it } from 'vitest';

import {
  buildDevToolbarInfo,
  injectDevToolbar,
  resolveDevToolbarEnabled,
  resolveDevToolbarDocsUrl,
} from '../src/dev-toolbar';
import type { HtPageInfo } from '../src/types';

const page: HtPageInfo = {
  id: 'blog/[slug]',
  entryPath: '/proj/src/blog/[slug].ht.js',
  absolutePath: '/proj/src/blog/[slug].ht.js',
  relativePath: 'src/blog/[slug].ht.js',
  routePattern: '/blog/[slug]',
  routePath: '/blog/hello',
  fileName: '[slug].ht.js',
  dynamic: true,
  paramNames: ['slug'],
  paramDefinitions: [{ name: 'slug', type: 'single' }],
  params: { slug: 'hello' },
};

describe('dev toolbar', () => {
  it('defaults to enabled', () => {
    expect(resolveDevToolbarEnabled({})).toBe(true);
    expect(resolveDevToolbarEnabled({ devToolbar: false })).toBe(false);
  });

  it('resolves docs URL from displayName', () => {
    expect(resolveDevToolbarDocsUrl({ displayName: 'sitelo' })).toBe(
      'https://sitelo.js.org/docs',
    );
    expect(
      resolveDevToolbarDocsUrl({
        displayName: 'sitelo',
        devToolbarDocsUrl: 'https://example.com/docs',
      }),
    ).toBe('https://example.com/docs');
  });

  it('injects toolbar markup before </body>', () => {
    const info = buildDevToolbarInfo({
      page,
      options: { displayName: 'sitelo' },
      pluginVersion: '2.3.0',
    });

    const html = injectDevToolbar(
      '<html><body><h1>Hi</h1></body></html>',
      info,
    );

    expect(html).toContain('data-html-pages-dev-toolbar');
    expect(html).toContain('hp-dev-toolbar');
    expect(html).toContain('/blog/hello');
    expect(html).toContain('src/blog/[slug].ht.js');
    expect(html).toContain('"displayName":"sitelo"');
    expect(html.indexOf('data-html-pages-dev-toolbar')).toBeLessThan(
      html.indexOf('</body>'),
    );
  });
});
