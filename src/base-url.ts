import type { HtmlAssetSource } from 'vite';

/*
 * Vite's convention for `base`, applied to the HTML a build writes.
 *
 * Page HTML is written for a site at the root. In dev, Vite's
 * `transformIndexHtml` joins `base` onto every root-relative URL in an
 * asset attribute — a `<link>`'s `href`, a `<script>`'s `src`, an
 * `<img>`'s `srcset` — and onto `import('/…')` in inline scripts. The
 * build has to do the same, or a page that works in dev 404s on its own
 * stylesheet once `dist/` is served from `/repo/`.
 *
 * What Vite leaves alone in dev is left alone here too: `<a href>`,
 * event handler attributes, anything marked `vite-ignore`. A URL there
 * carries the base only if the page wrote it in.
 */

const ALLOWED_META_NAME = [
  'msapplication-tileimage',
  'msapplication-square70x70logo',
  'msapplication-square150x150logo',
  'msapplication-wide310x150logo',
  'msapplication-square310x310logo',
  'msapplication-config',
  'twitter:image',
];

const ALLOWED_META_PROPERTY = [
  'og:image',
  'og:image:url',
  'og:image:secure_url',
  'og:audio',
  'og:audio:secure_url',
  'og:video',
  'og:video:secure_url',
];

/** Vite's own list (`DEFAULT_HTML_ASSET_SOURCES`), plus `<script src>`, which Vite handles on its own. */
const DEFAULT_HTML_ASSET_SOURCES: Record<string, HtmlAssetSource> = {
  audio: { srcAttributes: ['src'] },
  embed: { srcAttributes: ['src'] },
  img: { srcAttributes: ['src'], srcsetAttributes: ['srcset'] },
  image: { srcAttributes: ['href', 'xlink:href'] },
  input: { srcAttributes: ['src'] },
  link: { srcAttributes: ['href'], srcsetAttributes: ['imagesrcset'] },
  object: { srcAttributes: ['data'] },
  script: { srcAttributes: ['src'] },
  source: { srcAttributes: ['src'], srcsetAttributes: ['srcset'] },
  track: { srcAttributes: ['src'] },
  use: { srcAttributes: ['href', 'xlink:href'] },
  video: { srcAttributes: ['src', 'poster'] },
  meta: {
    srcAttributes: ['content'],
    filter({ attributes }) {
      const name = attributes.name?.trim().toLowerCase();
      const property = attributes.property?.trim().toLowerCase();

      return (
        (!!name && ALLOWED_META_NAME.includes(name)) ||
        (!!property && ALLOWED_META_PROPERTY.includes(property))
      );
    },
  },
};

const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;

/**
 * In document order: a comment, an element whose content is text rather
 * than markup (so an `<img>` in a script's string is not an element), or
 * any other start tag.
 */
const MARKUP_RE = new RegExp(
  `<!--[\\s\\S]*?(?:-->|$)` +
    `|<(script|style|textarea|title|xmp|iframe|noembed|noframes)(?=[\\s/>])(${ATTRS})>([\\s\\S]*?)(<\\/\\1\\s*>|$)` +
    `|<([a-zA-Z][^\\s/>]*)(${ATTRS})>`,
  'gi',
);

/** One attribute, with the whitespace before it, so it can be dropped whole. */
const ATTR_RE =
  /(\s*)([^\s"'<>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** A literal dynamic import, as Vite matches it in an inline script. */
const INLINE_IMPORT_RE =
  /((?<!(?<!\.\.)\.)\bimport\s*\(\s*)(["'])([^"'`]*)\2(?=\s*\))/g;

function isRootRelative(url: string): boolean {
  return url[0] === '/' && url[1] !== '/';
}

function isRelativeBase(base: string): boolean {
  return base === '' || base.startsWith('.');
}

/**
 * The base to write into a page emitted at `fileName`.
 *
 * A relative base (`./`) becomes the path from that page back to the
 * output root, as in Vite's own HTML build: `blog/post/index.html` gets
 * `../../`. Any other base is used as is, with a trailing slash.
 */
export function pageBase(base: string, fileName: string): string {
  if (isRelativeBase(base)) {
    const depth = fileName.replace(/\\/g, '/').replace(/^\/+/, '').split('/').length - 1;

    return depth === 0 ? './' : '../'.repeat(depth);
  }

  return base.endsWith('/') ? base : `${base}/`;
}

/** `/site.css` under `/repo/` is `/repo/site.css`; anything not root-relative is left alone. */
export function joinBase(url: string, base: string): string {
  return isRootRelative(url) ? base + url.slice(1) : url;
}

/**
 * The root-relative URL a page meant by one carrying `base`:
 * `/repo/site.css` is `/site.css`. A URL not under the base comes back
 * unchanged.
 */
export function stripBase(url: string, base: string): string {
  if (base === '/' || !url.startsWith(base)) return url;

  return `/${url.slice(base.length)}`;
}

/**
 * Joins `base` onto each image candidate's URL, leaving descriptors and
 * spacing as written. A candidate's URL runs to the next whitespace, so
 * a comma inside it (`/w_100,h_100.png`) is not a separator.
 */
function joinBaseToSrcset(srcset: string, base: string): string {
  let out = '';
  let i = 0;

  while (i < srcset.length) {
    const gap = /^[\s,]*/.exec(srcset.slice(i))![0];
    out += gap;
    i += gap.length;

    if (i >= srcset.length) break;

    const token = /^\S+/.exec(srcset.slice(i))![0];
    const url = token.replace(/,+$/, '');
    out += joinBase(url, base) + token.slice(url.length);
    i += token.length;

    // A trailing comma ends the candidate; otherwise its descriptors run
    // to the next comma that is not inside parentheses.
    if (url !== token) continue;

    let depth = 0;
    const start = i;

    for (; i < srcset.length; i++) {
      const char = srcset[i];

      if (char === '(') depth++;
      else if (char === ')') depth = Math.max(0, depth - 1);
      else if (char === ',' && depth === 0) break;
    }

    out += srcset.slice(start, i);
  }

  return out;
}

function parseAttributes(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const match of attrs.matchAll(ATTR_RE)) {
    const key = match[2].toLowerCase();

    // The first of a repeated attribute is the one the browser keeps.
    if (!(key in out)) out[key] = match[4] ?? match[5] ?? match[6] ?? '';
  }

  return out;
}

function rewriteAttributes(
  tagName: string,
  attrs: string,
  base: string,
  additionalAssetSources: Record<string, HtmlAssetSource> | undefined,
): string {
  const name = tagName.toLowerCase();
  const sources = [
    DEFAULT_HTML_ASSET_SOURCES[name],
    additionalAssetSources?.[name],
  ].filter((source): source is HtmlAssetSource => !!source);

  if (sources.length === 0) return attrs;

  const attributes = parseAttributes(attrs);

  // Vite's opt-out: the element is left as written, minus the marker.
  if ('vite-ignore' in attributes) {
    return attrs.replace(ATTR_RE, (whole, _lead: string, key: string) =>
      key.toLowerCase() === 'vite-ignore' ? '' : whole,
    );
  }

  const srcKeys = new Set<string>();
  const srcsetKeys = new Set<string>();

  for (const source of sources) {
    const wanted = (key: string) => {
      const value = attributes[key];

      return !!value && (!source.filter || source.filter({ key, value, attributes }));
    };

    source.srcAttributes?.filter(wanted).forEach((key) => srcKeys.add(key));
    source.srcsetAttributes?.filter(wanted).forEach((key) => srcsetKeys.add(key));
  }

  if (srcKeys.size === 0 && srcsetKeys.size === 0) return attrs;

  return attrs.replace(
    ATTR_RE,
    (
      whole,
      lead: string,
      key: string,
      equals: string | undefined,
      doubleQuoted: string | undefined,
      singleQuoted: string | undefined,
      unquoted: string | undefined,
    ) => {
      const value = doubleQuoted ?? singleQuoted ?? unquoted;
      const lowerKey = key.toLowerCase();

      if (value === undefined) return whole;

      const rewritten = srcKeys.has(lowerKey)
        ? joinBase(value, base)
        : srcsetKeys.has(lowerKey)
          ? joinBaseToSrcset(value, base)
          : value;

      if (rewritten === value) return whole;

      const quote =
        doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';

      return `${lead}${key}${equals}${quote}${rewritten}${quote}`;
    },
  );
}

/**
 * Joins `base` onto the root-relative URLs that Vite's dev server would
 * put it on: asset attributes (Vite's list, plus any
 * `html.additionalAssetSources`) and literal `import('/…')` in inline
 * scripts. `base` is the page's own — see {@link pageBase}.
 */
export function applyBaseToHtml(
  html: string,
  base: string,
  additionalAssetSources?: Record<string, HtmlAssetSource>,
): string {
  if (base === '/') return html;

  return html.replace(
    MARKUP_RE,
    (
      whole,
      textTag: string | undefined,
      textAttrs: string,
      text: string,
      textClose: string,
      tag: string | undefined,
      attrs: string,
    ) => {
      if (tag) {
        return `<${tag}${rewriteAttributes(tag, attrs, base, additionalAssetSources)}>`;
      }

      if (!textTag) return whole;

      const isInlineScript =
        textTag.toLowerCase() === 'script' && !('src' in parseAttributes(textAttrs));

      const content = isInlineScript
        ? text.replace(
            INLINE_IMPORT_RE,
            (_, open: string, quote: string, url: string) =>
              `${open}${quote}${joinBase(url, base)}${quote}`,
          )
        : text;

      return `<${textTag}${rewriteAttributes(textTag, textAttrs, base, additionalAssetSources)}>${content}${textClose}`;
    },
  );
}
