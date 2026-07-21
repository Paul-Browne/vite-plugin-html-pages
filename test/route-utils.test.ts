import { describe, expect, it } from 'vitest';

import {
  compareRoutePriority,
  fileNameFromRoute,
  fillParams,
  getParamNames,
  isDynamicPage,
  matchDynamicPage,
  routeMatch,
  toRoutePattern,
} from '../src/route-utils';
import type { HtPageInfo } from '../src/types';

const EXTENSIONS = [
  '.ht.js',
  '.html.js',
  '.ht.ts',
  '.html.ts',
  '.ht.jsx',
  '.html.jsx',
  '.ht.tsx',
  '.html.tsx',
];

describe('toRoutePattern', () => {
  it('maps a root index file to /', () => {
    expect(toRoutePattern('index.ht.js', EXTENSIONS)).toBe('/');
  });

  it('maps a nested index file to its directory', () => {
    expect(toRoutePattern('blog/index.ht.js', EXTENSIONS)).toBe('/blog');
  });

  it('maps a plain page file to its path', () => {
    expect(toRoutePattern('about.html.ts', EXTENSIONS)).toBe('/about');
  });

  it('supports every page extension', () => {
    for (const ext of EXTENSIONS) {
      expect(toRoutePattern(`about${ext}`, EXTENSIONS)).toBe('/about');
    }
  });

  it('converts dynamic segments', () => {
    expect(toRoutePattern('blog/[slug].ht.js', EXTENSIONS)).toBe(
      '/blog/:slug',
    );
  });

  it('converts catch-all segments', () => {
    expect(toRoutePattern('docs/[...path].ht.js', EXTENSIONS)).toBe(
      '/docs/*:path',
    );
  });

  it('converts optional catch-all segments', () => {
    expect(toRoutePattern('docs/[...path]?.ht.js', EXTENSIONS)).toBe(
      '/docs/*?:path',
    );
  });

  it('removes route groups', () => {
    expect(toRoutePattern('(marketing)/pricing.ht.js', EXTENSIONS)).toBe(
      '/pricing',
    );
  });
});

describe('isDynamicPage / getParamNames', () => {
  it('detects dynamic pages', () => {
    expect(isDynamicPage('blog/[slug].ht.js')).toBe(true);
    expect(isDynamicPage('docs/[...path].ht.js')).toBe(true);
    expect(isDynamicPage('about.ht.js')).toBe(false);
  });

  it('extracts param names in order', () => {
    expect(getParamNames('[lang]/blog/[slug].ht.js')).toEqual([
      'lang',
      'slug',
    ]);
  });
});

describe('fillParams', () => {
  it('fills single params', () => {
    expect(fillParams('/blog/:slug', { slug: 'hello' })).toBe('/blog/hello');
  });

  it('stringifies non-string primitives', () => {
    expect(fillParams('/page/:n', { n: 5 })).toBe('/page/5');
  });

  it('encodes single param values', () => {
    expect(fillParams('/blog/:slug', { slug: 'a b' })).toBe('/blog/a%20b');
  });

  it('throws for a missing single param', () => {
    expect(() => fillParams('/blog/:slug', {})).toThrow(
      'Missing route param "slug"',
    );
  });

  it('rejects array values for single params', () => {
    expect(() => fillParams('/u/:id', { id: ['a'] })).toThrow(
      'must be a string',
    );
  });

  it('fills catch-all params from arrays', () => {
    expect(fillParams('/docs/*:path', { path: ['a', 'b'] })).toBe('/docs/a/b');
  });

  it('fills catch-all params from slash-separated strings', () => {
    expect(fillParams('/docs/*:path', { path: 'a/b' })).toBe('/docs/a/b');
  });

  it('encodes each catch-all part separately', () => {
    expect(fillParams('/docs/*:path', { path: ['a b', 'c'] })).toBe(
      '/docs/a%20b/c',
    );
  });

  it('throws for a missing catch-all param', () => {
    expect(() => fillParams('/docs/*:path', {})).toThrow(
      'Missing catch-all route param "path"',
    );
  });

  it('throws for an empty catch-all param', () => {
    expect(() => fillParams('/docs/*:path', { path: [] })).toThrow(
      'must not be empty',
    );
  });

  it('drops empty optional catch-all params', () => {
    expect(fillParams('/docs/*?:path', {})).toBe('/docs');
    expect(fillParams('/docs/*?:path', { path: '' })).toBe('/docs');
  });

  it('fills optional catch-all params when provided', () => {
    expect(fillParams('/docs/*?:path', { path: ['x', 'y'] })).toBe(
      '/docs/x/y',
    );
  });
});

describe('fileNameFromRoute', () => {
  it('maps / to index.html', () => {
    expect(fileNameFromRoute('/', true)).toBe('index.html');
    expect(fileNameFromRoute('/', false)).toBe('index.html');
  });

  it('uses directory-style files with cleanUrls', () => {
    expect(fileNameFromRoute('/about', true)).toBe('about/index.html');
    expect(fileNameFromRoute('/blog/post', true)).toBe(
      'blog/post/index.html',
    );
  });

  it('uses flat files without cleanUrls', () => {
    expect(fileNameFromRoute('/about', false)).toBe('about.html');
  });
});

describe('routeMatch', () => {
  it('matches static routes exactly', () => {
    expect(routeMatch('/', '/')).toEqual({});
    expect(routeMatch('/about', '/about')).toEqual({});
    expect(routeMatch('/about', '/other')).toBeNull();
  });

  it('matches single params', () => {
    expect(routeMatch('/blog/:slug', '/blog/hello')).toEqual({
      slug: 'hello',
    });
    expect(routeMatch('/blog/:slug', '/blog')).toBeNull();
    expect(routeMatch('/blog/:slug', '/blog/a/b')).toBeNull();
  });

  it('decodes matched params', () => {
    expect(routeMatch('/blog/:slug', '/blog/a%20b')).toEqual({
      slug: 'a b',
    });
  });

  it('matches catch-all params', () => {
    expect(routeMatch('/docs/*:path', '/docs/a/b')).toEqual({
      path: ['a', 'b'],
    });
    expect(routeMatch('/docs/*:path', '/docs')).toBeNull();
  });

  it('matches optional catch-all params', () => {
    expect(routeMatch('/docs/*?:path', '/docs')).toEqual({});
    expect(routeMatch('/docs/*?:path', '/docs/a/b')).toEqual({
      path: ['a', 'b'],
    });
  });
});

describe('matchDynamicPage', () => {
  function makeEntry(
    routePattern: string,
    dynamic = true,
  ): HtPageInfo {
    return {
      id: `/project/src${routePattern}.ht.js`,
      entryPath: `/project/src${routePattern}.ht.js`,
      absolutePath: `/project/src${routePattern}.ht.js`,
      relativePath: `src${routePattern}.ht.js`,
      routePattern,
      routePath: routePattern,
      fileName: '',
      dynamic,
      paramNames: [],
      paramDefinitions: [],
      params: {},
    };
  }

  it('matches a single-param pattern and fills params', () => {
    const entry = makeEntry('/blog/:slug');

    const page = matchDynamicPage([entry], '/blog/hello');

    expect(page).not.toBeNull();
    expect(page?.routePath).toBe('/blog/hello');
    expect(page?.params).toEqual({ slug: 'hello' });
    expect(page?.entryPath).toBe(entry.entryPath);
  });

  it('matches catch-all patterns with array params', () => {
    const page = matchDynamicPage(
      [makeEntry('/docs/*:path')],
      '/docs/api/auth',
    );

    expect(page?.params).toEqual({ path: ['api', 'auth'] });
  });

  it('prefers more specific patterns when several match', () => {
    const catchAll = makeEntry('/blog/*:path');
    const single = makeEntry('/blog/:slug');

    const page = matchDynamicPage([catchAll, single], '/blog/hello');

    expect(page?.routePattern).toBe('/blog/:slug');
    expect(page?.params).toEqual({ slug: 'hello' });
  });

  it('ignores non-dynamic entries', () => {
    const page = matchDynamicPage(
      [makeEntry('/about', false)],
      '/about',
    );

    expect(page).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const page = matchDynamicPage(
      [makeEntry('/blog/:slug')],
      '/shop/item',
    );

    expect(page).toBeNull();
  });
});

describe('compareRoutePriority', () => {
  it('ranks static segments before dynamic ones', () => {
    expect(compareRoutePriority('/a/b', '/a/:x')).toBeLessThan(0);
    expect(compareRoutePriority('/a/:x', '/a/b')).toBeGreaterThan(0);
  });

  it('ranks dynamic segments before catch-alls', () => {
    expect(compareRoutePriority('/a/:x', '/a/*:rest')).toBeLessThan(0);
  });

  it('ranks catch-alls before optional catch-alls', () => {
    expect(compareRoutePriority('/a/*:rest', '/a/*?:rest')).toBeLessThan(0);
  });

  it('sorts a route table into expected order', () => {
    const routes = ['/a/*?:rest', '/a/:x', '/a/b', '/a/*:rest'];
    routes.sort(compareRoutePriority);
    expect(routes).toEqual(['/a/b', '/a/:x', '/a/*:rest', '/a/*?:rest']);
  });
});
