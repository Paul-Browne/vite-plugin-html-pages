# vite-plugin-htjs-pages

[![npm version](https://img.shields.io/npm/v/vite-plugin-htjs-pages.svg)](https://www.npmjs.com/package/vite-plugin-htjs-pages)
[![npm downloads](https://img.shields.io/npm/dm/vite-plugin-htjs-pages.svg)](https://www.npmjs.com/package/vite-plugin-htjs-pages)
[![license](https://img.shields.io/npm/l/vite-plugin-htjs-pages.svg)](LICENSE)
[![vite](https://img.shields.io/badge/vite-plugin-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)

Minimal **static site generation (SSG) for Vite** using JavaScript functions that return HTML.

Generate static HTML pages from `*.ht.js` modules using Vite and [`javascript-to-html`](https://www.npmjs.com/package/javascript-to-html).

⭐ If this project helps you, please consider starring it.

## Built for the Vite ecosystem

Works seamlessly with:

- ⚡ **Vite**
- 📦 **Rollup / Rolldown**
- 🧩 **javascript-to-html**

A minimal **static site generator for Vite** that keeps pages as simple JavaScript functions returning HTML.

---

## Features

- File-based routing
- Dynamic routes (`[slug].ht.js`)
- Catch-all routes (`[...slug].ht.js`)
- Static params generation
- Dev server SSR rendering
- Clean URL support
- Parallel batched page rendering
- Works naturally with `javascript-to-html`

---

## Why this exists

Modern static site tools are powerful, but they often introduce:

- frameworks
- component systems
- complex build pipelines
- opinionated conventions

Sometimes you just want to:

- write HTML
- organize pages in folders
- generate static files

`vite-plugin-htjs-pages` exists for that use case.

It gives you:

- file-based routing
- dynamic pages
- static generation
- dev server rendering

while keeping pages as **simple JavaScript functions that return HTML**.

---

## How it works

```
src/index.ht.js
src/blog/[slug].ht.js
        │
        ▼
 vite-plugin-htjs-pages
        │
        ▼
dist/index.html
dist/blog/hello-world/index.html
```

Pages are just **JavaScript functions that return HTML**.

---

## Installation

```bash
npm install vite-plugin-htjs-pages javascript-to-html
```

---

## Quick Start

### 1. Configure Vite

```js
import { defineConfig } from 'vite'
import { htPages } from 'vite-plugin-htjs-pages'

export default defineConfig({
  plugins: [htPages()]
})
```

### 2. Create a page

```
src/index.ht.js
```

```js
import { fragment, html, head, body, title, h1 } from 'javascript-to-html'

export default () => fragment(
  '<!doctype html>',
  html(
    head(
      title('Hello')
    ),
    body(
      h1('Hello world')
    )
  )
)
```

### 3. Run dev server

```bash
vite
```

Open:

```
http://localhost:5173
```

### 4. Build

```bash
vite build
```

Output:

```
dist/index.html
```

---

## File-Based Routing

Routes are derived from the filesystem.

```
src/

  index.ht.js
  about.ht.js

  blog/
    [slug].ht.js

  docs/
    [...slug].ht.js
```

Produces:

```
/index.html
/about/index.html
/blog/hello-world/index.html
/docs/getting-started/index.html
```

---

## Dynamic Routes

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

---

## Catch-All Routes

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
      h1(params.slug)
    )
  )
)
```

---

## Data Loading

Pages may export a `data()` function.

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

## Layouts

Layouts are reusable functions.

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

Use in pages:

```js
import layout from '../templates/layout.js'
import { h1 } from 'javascript-to-html'

export default () => layout(
  h1('Home page')
)
```

---

## Components

Components are simple functions.

```js
import { nav, a } from 'javascript-to-html'

export default () => nav(
  a({ href: '/' }, 'Home'),
  a({ href: '/blog' }, 'Blog')
)
```

---

## Routing Priority

Routes are sorted automatically.

| Type | Example | Priority |
|-----|------|------|
| Static | `/blog/new` | Highest |
| Dynamic | `/blog/:slug` | Medium |
| Catch-all | `/docs/*:slug` | Lowest |

This prevents dynamic routes from overriding static pages.

---

## Plugin Options

```js
htPages({
  cleanUrls: true,
  renderConcurrency: 8,
  renderBatchSize: 64
})
```

| Option | Description |
|------|------|
| `pagesDir` | root directory for pages |
| `include` | page glob pattern |
| `exclude` | excluded patterns |
| `cleanUrls` | `/page/index.html` instead of `/page.html` |
| `renderConcurrency` | concurrent page renders |
| `renderBatchSize` | render batch size |
| `mapOutputPath` | customize output path |

---

## Performance Tips

Large sites (500+ pages):

```js
htPages({
  renderConcurrency: 16,
  renderBatchSize: 128
})
```

Keeps builds stable and memory usage predictable.

---

## Use Cases

`vite-plugin-htjs-pages` works well for:

- **Vite static site generation**
- **File-based routing with Vite**
- **Generating static HTML with Vite**
- **Vite blog generators**
- **Documentation sites with Vite**
- **Minimal static site generators**
- **HTML-first Vite projects**

---

## Comparison

| Tool | Focus |
|-----|-----|
| Astro | component framework |
| Next.js | SSR framework |
| vite-plugin-htjs-pages | minimal static HTML generation |

This plugin intentionally stays **small and unopinionated**.

---

## FAQ

### Can I use React/Vue?

Technically yes, but the plugin is intended for **HTML generation**, not SPA rendering.

### Does it scale to large sites?

Yes. Rendering is batched and parallelized.

### How do I share layouts?

Just export functions and import them.

---

## Philosophy

The plugin intentionally avoids framework features like:

- DOM patching HMR
- layout systems
- route groups
- complex data loaders

The goal is a **small predictable core**.

Pages are simply **functions that return HTML**.

---

## License

MIT
