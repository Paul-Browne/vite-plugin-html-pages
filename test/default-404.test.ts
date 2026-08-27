import { describe, expect, it } from 'vitest';

import { defaultNotFoundHtml } from '../src/plugin';

function homeHref(html: string): string | undefined {
  return html.match(/<a href="([^"]*)">Go back home<\/a>/)?.[1];
}

describe('defaultNotFoundHtml', () => {
  it('links to the site root when there is no base', () => {
    expect(homeHref(defaultNotFoundHtml('/'))).toBe('/');
  });

  it('honours a base path', () => {
    // A hardcoded "/" here would send the visitor to the host root
    // instead of back into a site served from /repo/.
    expect(homeHref(defaultNotFoundHtml('/repo/'))).toBe('/repo/');
  });

  it('normalises a base with no trailing slash', () => {
    expect(homeHref(defaultNotFoundHtml('/repo'))).toBe('/repo/');
  });

  it('handles a nested base', () => {
    expect(homeHref(defaultNotFoundHtml('/a/b/'))).toBe('/a/b/');
  });

  it('still produces a complete document', () => {
    const html = defaultNotFoundHtml('/repo/');

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>404 - Page Not Found</title>');
    expect(html).toContain('<h1>404</h1>');
  });
});
