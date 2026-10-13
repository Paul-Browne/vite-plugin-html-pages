import { describe, expect, it } from 'vitest';

import {
  applyBaseToHtml,
  joinBase,
  pageBase,
  stripBase,
} from '../src/base-url';

describe('applyBaseToHtml', () => {
  const base = '/repo/';

  it('joins the base onto root-relative stylesheet and script URLs', () => {
    const html =
      '<link rel="stylesheet" href="/site.css">' +
      '<script type="module" src="/main.js"></script>';

    expect(applyBaseToHtml(html, base)).toBe(
      '<link rel="stylesheet" href="/repo/site.css">' +
        '<script type="module" src="/repo/main.js"></script>',
    );
  });

  it('covers the rest of the asset attributes Vite rebases in dev', () => {
    const html = [
      '<link rel="icon" href="/favicon.svg">',
      '<link rel="preload" as="image" imagesrcset="/hero.png 1x, /hero@2x.png 2x">',
      '<img src="/logo.png" srcset="/logo.png 1x, /logo@2x.png 2x">',
      '<video src="/clip.mp4" poster="/poster.jpg"><source src="/clip.webm"><track src="/subs.vtt"></video>',
      '<picture><source srcset="/a.avif"></picture>',
      '<audio src="/sound.mp3"></audio>',
      '<embed src="/doc.pdf"><object data="/movie.swf"></object>',
      '<input type="image" src="/go.png">',
      '<svg><use href="/sprite.svg#icon"></use><image xlink:href="/pic.png"></image></svg>',
    ].join('');

    expect(applyBaseToHtml(html, base)).toBe(
      [
        '<link rel="icon" href="/repo/favicon.svg">',
        '<link rel="preload" as="image" imagesrcset="/repo/hero.png 1x, /repo/hero@2x.png 2x">',
        '<img src="/repo/logo.png" srcset="/repo/logo.png 1x, /repo/logo@2x.png 2x">',
        '<video src="/repo/clip.mp4" poster="/repo/poster.jpg"><source src="/repo/clip.webm"><track src="/repo/subs.vtt"></video>',
        '<picture><source srcset="/repo/a.avif"></picture>',
        '<audio src="/repo/sound.mp3"></audio>',
        '<embed src="/repo/doc.pdf"><object data="/repo/movie.swf"></object>',
        '<input type="image" src="/repo/go.png">',
        '<svg><use href="/repo/sprite.svg#icon"></use><image xlink:href="/repo/pic.png"></image></svg>',
      ].join(''),
    );
  });

  it('rewrites image meta tags only', () => {
    const html =
      '<meta property="og:image" content="/og.png">' +
      '<meta name="twitter:image" content="/card.png">' +
      '<meta name="description" content="/not-a-url">';

    expect(applyBaseToHtml(html, base)).toBe(
      '<meta property="og:image" content="/repo/og.png">' +
        '<meta name="twitter:image" content="/repo/card.png">' +
        '<meta name="description" content="/not-a-url">',
    );
  });

  it('leaves alone what Vite leaves alone: page links, forms, frames, handlers', () => {
    const html =
      '<a href="/about">About</a>' +
      '<form action="/search"></form>' +
      '<iframe src="/embed"></iframe>' +
      `<button onclick="import('/su/menu.js')">Menu</button>`;

    expect(applyBaseToHtml(html, base)).toBe(html);
  });

  it('leaves URLs that are not root-relative alone', () => {
    const html =
      '<script src="https://cdn.example.com/lib.js"></script>' +
      '<script src="//cdn.example.com/lib2.js"></script>' +
      '<script src="./local.js"></script>' +
      '<img src="data:image/png;base64,AAAA">' +
      '<use href="#icon"></use>';

    expect(applyBaseToHtml(html, base)).toBe(html);
  });

  it('keeps descriptors and odd spacing in srcset, and commas inside a URL', () => {
    expect(
      applyBaseToHtml(
        '<img srcset="/w_100,h_100.png 100w,/big.png 200w ,  https://cdn.example.com/x.png 3x">',
        base,
      ),
    ).toBe(
      '<img srcset="/repo/w_100,h_100.png 100w,/repo/big.png 200w ,  https://cdn.example.com/x.png 3x">',
    );
  });

  it('keeps the quoting as written', () => {
    expect(
      applyBaseToHtml(
        `<link rel=stylesheet href='/a.css'><link rel=stylesheet href=/b.css><img src=/c.png/>`,
        base,
      ),
    ).toBe(
      `<link rel=stylesheet href='/repo/a.css'><link rel=stylesheet href=/repo/b.css><img src=/repo/c.png/>`,
    );
  });

  it('matches tag and attribute names in any case', () => {
    expect(applyBaseToHtml('<LINK REL="stylesheet" HREF="/a.css">', base)).toBe(
      '<LINK REL="stylesheet" HREF="/repo/a.css">',
    );
  });

  it('keeps a URL marked vite-ignore as written, and drops the marker', () => {
    expect(
      applyBaseToHtml(
        '<link rel="stylesheet" href="/repo/su/ui.css" vite-ignore>' +
          '<script vite-ignore src="/legacy.js"></script>',
        base,
      ),
    ).toBe(
      '<link rel="stylesheet" href="/repo/su/ui.css">' +
        '<script src="/legacy.js"></script>',
    );
  });

  it('joins the base onto literal dynamic imports in inline scripts', () => {
    const html =
      `<script>import('/a.js'); x.import('/not-this.js');</script>` +
      `<script type="module">import("/b.js").then((m) => m.init())</script>`;

    expect(applyBaseToHtml(html, base)).toBe(
      `<script>import('/repo/a.js'); x.import('/not-this.js');</script>` +
        `<script type="module">import("/repo/b.js").then((m) => m.init())</script>`,
    );
  });

  it('does not read markup inside scripts, styles, titles or comments', () => {
    const html =
      `<script>const tpl = '<img src="/inside-script.png">';</script>` +
      `<style>a::after { content: '<img src="/inside-style.png">'; }</style>` +
      `<title><img src="/inside-title.png"></title>` +
      `<!-- <link rel="stylesheet" href="/commented.css"> -->`;

    expect(applyBaseToHtml(html, base)).toBe(html);
  });

  it('does not mistake a custom element for a script or title', () => {
    expect(
      applyBaseToHtml('<title-bar></title-bar><img src="/logo.png">', base),
    ).toBe('<title-bar></title-bar><img src="/repo/logo.png">');
  });

  it('honours html.additionalAssetSources', () => {
    expect(
      applyBaseToHtml(
        '<img data-src-dark="/dark.png"><lazy-img src="/lazy.png"></lazy-img>',
        base,
        {
          img: { srcAttributes: ['data-src-dark'] },
          'lazy-img': { srcAttributes: ['src'] },
        },
      ),
    ).toBe(
      '<img data-src-dark="/repo/dark.png"><lazy-img src="/repo/lazy.png"></lazy-img>',
    );
  });

  it('changes nothing under the root base', () => {
    const html = '<link rel="stylesheet" href="/site.css">';

    expect(applyBaseToHtml(html, '/')).toBe(html);
  });

  it('applies a full URL base', () => {
    expect(
      applyBaseToHtml(
        '<link rel="stylesheet" href="/site.css">',
        'https://cdn.example.com/repo/',
      ),
    ).toBe('<link rel="stylesheet" href="https://cdn.example.com/repo/site.css">');
  });

  it('applies a relative page base', () => {
    expect(
      applyBaseToHtml('<link rel="stylesheet" href="/site.css">', '../../'),
    ).toBe('<link rel="stylesheet" href="../../site.css">');
  });
});

describe('pageBase', () => {
  it('uses an absolute base as is', () => {
    expect(pageBase('/repo/', 'blog/post/index.html')).toBe('/repo/');
    expect(pageBase('/', 'index.html')).toBe('/');
  });

  it('adds a missing trailing slash', () => {
    expect(pageBase('/repo', 'index.html')).toBe('/repo/');
  });

  it('turns a relative base into the path back to the output root', () => {
    expect(pageBase('./', 'index.html')).toBe('./');
    expect(pageBase('./', '404.html')).toBe('./');
    expect(pageBase('./', 'about/index.html')).toBe('../');
    expect(pageBase('./', 'blog/post/index.html')).toBe('../../');
  });
});

describe('joinBase and stripBase', () => {
  it('round-trips a root-relative URL', () => {
    expect(joinBase('/site.css?v=2', '/repo/')).toBe('/repo/site.css?v=2');
    expect(stripBase('/repo/site.css?v=2', '/repo/')).toBe('/site.css?v=2');
  });

  it('leaves a URL outside the base unchanged', () => {
    expect(stripBase('/other/site.css', '/repo/')).toBe('/other/site.css');
    expect(stripBase('/repository.css', '/repo/')).toBe('/repository.css');
  });

  it('strips one base at a time', () => {
    expect(stripBase('/repo/repo/site.css', '/repo/')).toBe('/repo/site.css');
  });

  it('strips full URL and relative bases', () => {
    expect(
      stripBase('https://cdn.example.com/repo/site.css', 'https://cdn.example.com/repo/'),
    ).toBe('/site.css');
    expect(stripBase('../../site.css', '../../')).toBe('/site.css');
  });
});
