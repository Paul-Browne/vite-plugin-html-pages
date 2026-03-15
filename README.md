# vite-plugin-htjs-pages

A lightweight Vite plugin for generating static HTML from `*.ht.js` page modules.

Pages are written as JavaScript that returns HTML. The plugin turns them into static HTML files during build.

This makes it ideal for **blogs, documentation sites, and marketing pages** where you want full control over HTML but still want a modern build pipeline.

---

# Features

- File‑based routing
- Dynamic routes (`[slug].ht.js`)
- Catch‑all routes (`[...slug].ht.js`)
- Static params generation (`generateStaticParams()`)
- Dev server SSR rendering
- Clean URL support
- Parallel + batched page rendering
- Compatible with HT.js style HTML generation

---

# Installation

```bash
npm install vite-plugin-htjs-pages --save-dev
```

---

# Quick Start

### 1. Configure Vite

```ts
import { defineConfig } from 'vite'
import { htPages } from 'vite-plugin-htjs-pages'

export default defineConfig({
  plugins: [htPages()]
})
```

---

### 2. Create a page

```
src/index.ht.js
```

```js
import { fragment, html, head, title, body, h1 } from 'javascript-to-html'

export default () => fragment(
  '<!doctype html>',
  html(
    head(
      title('hello world')
    ),
    body(
      h1('Hello world')
    )
  )
)
```

---

### 3. Run dev server

```bash
vite
```

Open:

```
http://localhost:5173/
```

---

### 4. Build static HTML

```bash
vite build
```

Output:

```
dist/index.html
```

---

# Project Structure Example

```
src/

  index.ht.js

  blog/
    [slug].ht.js

  docs/
    [...slug].ht.js

  templates/
    layout.js
```

Build output:

```
dist/

  index.html

  blog/
    hello-world/index.html

  docs/
    getting-started/index.html
```

---

# Page Modules

Pages export a function returning HTML using `javascript-to-html` helpers.

```js
import { fragment, html, body, h1 } from 'javascript-to-html'

export default () => fragment(
  '<!doctype html>',
  html(
    body(
      h1('Hello')
    )
  )
)
```

Async rendering works too:

```js
import { fragment, html, body, h1 } from 'javascript-to-html'

export default async () => {
  const post = await loadPost()

  return fragment(
    '<!doctype html>',
    html(
      body(
        h1(post.title)
      )
    )
  )
}
```

---

# Data Loading

Pages can export a `data()` function.

```js
import { fragment, html, body, h1 } from 'javascript-to-html'

export async function data({ params }) {
  return {
    title: params.slug
  }
}

export default ({ data }) => fragment(
  '<!doctype html>',
  html(
    body(
      h1(data.title)
    )
  )
)
```

---

# Dynamic Routes

```
src/blog/[slug].ht.js
```

```js
import { fragment, html, body, h1 } from 'javascript-to-html'

export function generateStaticParams() {
  return [
    { slug: 'hello-world' },
    { slug: 'deep-dive' }
  ]
}

export default ({ params }) => fragment(
  '<!doctype html>',
  html(
    body(
      h1(params.slug)
    )
  )
)
```

Output:

```
/blog/hello-world/index.html
/blog/deep-dive/index.html
```

---

# Catch‑All Routes

```
src/docs/[...slug].ht.js
```

```js
import { fragment, html, body, h1 } from 'javascript-to-html'

export function generateStaticParams() {
  return [
    { slug: 'getting-started' },
    { slug: 'api/auth/login' }
  ]
}

export default ({ params }) => fragment(
  '<!doctype html>',
  html(
    body(
      h1(`Docs: ${params.slug}`)
    )
  )
)
```

Output:

```
/docs/getting-started/index.html
/docs/api/auth/login/index.html
```

---

# Routing Rules

Routes are automatically sorted so specific routes win.

| Type | Example | Priority |
|-----|------|------|
| Static | `/blog/new` | Highest |
| Dynamic | `/blog/:slug` | Medium |
| Catch‑all | `/docs/*:slug` | Lowest |

This prevents dynamic routes from accidentally overriding static pages.

---

# Plugin Options

```ts
htPages({
  cleanUrls: true,
  renderConcurrency: 8,
  renderBatchSize: 64
})
```

| Option | Description |
|------|------|
| `cleanUrls` | `/page/index.html` instead of `/page.html` |
| `renderConcurrency` | concurrent page renders |
| `renderBatchSize` | render batch size |
| `include` | page file glob |
| `exclude` | excluded globs |
| `pagesDir` | route root directory |
| `mapOutputPath` | customize output path |

---

# HT.js Example

```js
import { fragment, html, body, h1, p } from 'javascript-to-html'

export default () => fragment(
  '<!doctype html>',
  html(
    body(
      h1('Hello'),
      p('Welcome to my site')
    )
  )
)
```

---

# Example Blog Page

```
src/blog/[slug].ht.js
```

```js
import { fragment, html, body, article, h1, p } from 'javascript-to-html'

export function generateStaticParams() {
  return [
    { slug: 'my-first-post' },
    { slug: 'another-post' }
  ]
}

export async function data({ params }) {
  const post = await loadPost(params.slug)
  return { post }
}

export default ({ data }) => fragment(
  '<!doctype html>',
  html(
    body(
      article(
        h1(data.post.title),
        p(data.post.content)
      )
    )
  )
)
```

---

# Best Practices

### Keep layouts reusable

```
src/templates/layout.js
```

Pages import layouts instead of duplicating HTML.

---

### Keep data loading separate

Prefer this:

```js
export async function data() {}
```

Instead of heavy logic in the render function.

---

### Prefer deterministic builds

Dynamic pages should use `generateStaticParams()` so builds are predictable.

---

# Layouts

A common HT.js pattern is creating reusable layout templates.

```
src/templates/layout.js
```

Example layout:

```js
import { fragment, html, head, body } from 'javascript-to-html'

export default (...content) => fragment(
  '<!doctype html>',
  html(
    head(),
    body(
      ...content
    )
  )
)
```

Then use the layout in a page:

```js
import { h1 } from 'javascript-to-html'
import layout from '../templates/layout.js'

export default () => layout(
  h1('Home page')
)
```

This keeps page files small while sharing global structure.

---

# Reusable Components

HT.js works well with small reusable components.

Example component:

```
src/components/nav.js
```

```js
import { nav, a } from 'javascript-to-html'

export default () => nav(
  a({ href: '/' }, 'Home'),
  a({ href: '/blog' }, 'Blog')
)
```

Use inside pages or layouts:

```js
import { fragment, html, body, main, h1 } from 'javascript-to-html'
import nav from '../components/nav.js'

export default () => fragment(
  '<!doctype html>',
  html(
    body(
      nav(),
      main(
        h1('Welcome')
      )
    )
  )
)
```

Breaking UI into small components keeps templates maintainable and mirrors the approach used by component frameworks while remaining pure HTML generation.

---

# Performance Tips

Large sites (500+ pages) should increase batching:

```ts
htPages({
  renderConcurrency: 16,
  renderBatchSize: 128
})
```

This keeps memory usage stable during builds.

---

# Comparison

| Tool | Focus |
|----|----|
| Astro | full framework |
| Next.js | SSR framework |
| vite-plugin-htjs-pages | minimal static HTML generation |

This plugin intentionally stays **small and unopinionated**.

---

# FAQ

### Can I use React/Vue inside pages?

Technically yes, but this plugin is intended for **HTML generation**, not SPA rendering.

### Can I add layouts?

Yes — just import shared functions.

```
import layout from '../templates/layout.js'
```

### Does it support thousands of pages?

Yes. Batched rendering keeps builds stable even for very large sites.

---

# License

```
MIT
```

---

## Example dynamic page

```js
// src/blog/[slug].ht.js
import { fragment, html, head, title, body, main, h1 } from 'javascript-to-html'

export function generateStaticParams() {
  return [
    { slug: 'hello-world' },
    { slug: 'deep-dive' },
  ];
}

export async function data({ params }) {
  return {
    title: params.slug,
  };
}

export default ({ data }) => fragment(
  '<!doctype html>',
  html(
    head(
      title(data.title)
    ),
    body(
      main(
        h1(data.title)
      )
    )
  )
);
```

---

## Example catch-all page

```js
// src/docs/[...slug].ht.js
import { fragment, html, head, title, body, main, h1 } from 'javascript-to-html'

export function generateStaticParams() {
  return [
    { slug: 'getting-started' },
    { slug: 'api/auth/login' },
    { slug: 'guides/rendering/static' },
  ];
}

export default ({ params }) => fragment(
  '<!doctype html>',
  html(
    head(
      title(params.slug)
    ),
    body(
      main(
        h1(params.slug)
      )
    )
  )
);
```

---

## Notes

### Route precedence

Given both:

- `src/blog/new.ht.js`
- `src/blog/[slug].ht.js`

`/blog/new` will match the static page first.

### Catch-all routes

`src/docs/[...slug].ht.js` matches nested paths and expects `generateStaticParams()` to provide values like:

- `{ slug: 'getting-started' }`
- `{ slug: 'api/auth/login' }`

### Batched rendering

Large builds are processed in chunks for lower peak memory and more stable execution.

---

## What this version does well

- very small mental model
- static routes beat dynamic routes
- catch-all routes are supported
- no Node per-page dynamic-import loop in build mode
- static params are first-class
- dev mode stays simple by letting Vite SSR-load the page module directly
- build mode is calmer for large page counts

## What it intentionally does not do

- no custom DOM patch HMR
- no incremental dependency invalidation
- no smart route groups or layout system
- no optional catch-all routes yet

That tradeoff is deliberate: this is a strong small-core version to prototype or publish from.