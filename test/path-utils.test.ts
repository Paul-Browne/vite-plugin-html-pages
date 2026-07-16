import { describe, expect, it } from 'vitest';

import { normalizeRoutePath, stripPageSuffix, toPosix } from '../src/path-utils';

describe('toPosix', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toPosix('a\\b\\c.ht.js')).toBe('a/b/c.ht.js');
  });
});

describe('normalizeRoutePath', () => {
  it('keeps / as-is', () => {
    expect(normalizeRoutePath('/')).toBe('/');
    expect(normalizeRoutePath('')).toBe('/');
  });

  it('adds a leading slash', () => {
    expect(normalizeRoutePath('blog')).toBe('/blog');
  });

  it('collapses duplicate slashes', () => {
    expect(normalizeRoutePath('//blog///post')).toBe('/blog/post');
  });

  it('strips trailing slashes', () => {
    expect(normalizeRoutePath('/blog/')).toBe('/blog');
  });
});

describe('stripPageSuffix', () => {
  const EXTENSIONS = ['.ht.js', '.html.js', '.ht.ts', '.html.ts'];

  it('strips the matching page extension', () => {
    expect(stripPageSuffix('blog/index.ht.js', EXTENSIONS)).toBe('blog/index');
    expect(stripPageSuffix('about.html.ts', EXTENSIONS)).toBe('about');
  });

  it('prefers the longest matching extension', () => {
    // '.html.js' must win over a hypothetical shorter suffix.
    expect(stripPageSuffix('page.html.js', ['.js', '.html.js'])).toBe('page');
  });

  it('returns the path unchanged when nothing matches', () => {
    expect(stripPageSuffix('styles.css', EXTENSIONS)).toBe('styles.css');
  });
});
