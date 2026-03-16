# vite-plugin-htjs-pages

[![npm version](https://img.shields.io/npm/v/vite-plugin-htjs-pages.svg)](https://www.npmjs.com/package/vite-plugin-htjs-pages)
[![npm downloads](https://img.shields.io/npm/dm/vite-plugin-htjs-pages.svg)](https://www.npmjs.com/package/vite-plugin-htjs-pages)
[![license](https://img.shields.io/npm/l/vite-plugin-htjs-pages.svg)](LICENSE)
[![vite](https://img.shields.io/badge/vite-plugin-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)

Minimal **static site generation for Vite** using JavaScript files that return HTML.

Generate static HTML pages from `*.ht.js` modules using Vite and
[`javascript-to-html`](https://www.npmjs.com/package/javascript-to-html).

⭐ If this project helps you, please consider starring it.

# Built for the Vite ecosystem

Works seamlessly with:

-   ⚡ **Vite**
-   📦 **Rollup / Rolldown**
-   🧩 **javascript-to-html**

A minimal **static site generator for Vite** that keeps pages as simple
JavaScript functions returning HTML.

---

# TL;DR

Write this:

```js
// src/index.ht.js
import { fragment, html, body, h1 } from "javascript-to-html"

export default () => fragment(
  "<!doctype html>",
  html(
    body(
      h1("Hello world")
    )
  )
)
```

Run:

```bash
vite build
```

Get:

```
dist/index.html
```

---

# Features

- File-based routing
- Dynamic routes `[slug]`
- Multiple parameters `[year]/[slug]`
- Catch-all routes `[...slug]`
- Optional catch-all routes `[...slug]?`
- Route groups `(admin)/users.ht.js`
- Index routes `blog/[slug]/index.ht.js`
- Static params generation
- Dev server SSR rendering
- Parallel static generation
- Automatic `404.html`
- Automatic `sitemap.xml`
- Optional RSS feed generation
- Debug logging

---

# Installation

```bash
npm install vite-plugin-htjs-pages javascript-to-html
```

---

# Why this exists

Modern static site tools are powerful, but they often introduce:

-   frameworks
-   component systems
-   complex build pipelines
-   opinionated conventions

Sometimes you just want to:

-   write HTML
-   organize pages in folders
-   generate static files

`vite-plugin-htjs-pages` exists for that use case.

It gives you:

-   file‑based routing
-   dynamic pages
-   static generation
-   dev server rendering

while keeping pages as **simple JavaScript functions that return HTML**.

---

# Quick Start

### vite.config.js

```js
import { defineConfig } from "vite"
import { htPages } from "vite-plugin-htjs-pages"

export default defineConfig({
  plugins: [htPages()]
})
```

---

# Example Project Structure

```
src/

  index.ht.js
  about.ht.js

  blog/
    index.ht.js
    [slug].ht.js
    [year]/[slug].ht.js

  docs/
    [...slug]?.ht.js

  (admin)/
    users.ht.js
```

---

# Routing

Routes are generated directly from the filesystem.

| File | URL |
|-----|-----|
| `index.ht.js` | `/` |
| `about.ht.js` | `/about` |
| `blog/[slug].ht.js` | `/blog/my-post` |
| `blog/[year]/[slug].ht.js` | `/blog/2026/my-post` |
| `docs/[...slug].ht.js` | `/docs/api/auth/login` |
| `docs/[...slug]?.ht.js` | `/docs` or `/docs/getting-started` |
| `(admin)/users.ht.js` | `/users` |

---

# Dynamic Routes

```
src/blog/[slug].ht.js
```

Matches:

```
/blog/hello-world
/blog/my-first-post
```

Example:

``` js
import { fragment, html, body, h1 } from 'javascript-to-html'

export function generateStaticParams() {
  return [
    { slug: 'hello-world' },
    { slug: 'my-first-post' }
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

# Multiple Parameters

```
src/blog/[year]/[slug].ht.js
```

Matches:

```
/blog/2026/vite-routing
```

Params:

```
params.year
params.slug
```

---

# Catch-All Routes

```
src/docs/[...slug].ht.js
```

Matches:

```
/docs/api/auth/login
/docs/guides/rendering/static
```

Params:

```
params.slug === "api/auth/login"
```

---

# Optional Catch-All Routes

```
src/docs/[...slug]?.ht.js
```

Matches both:

```
/docs
/docs/getting-started
/docs/api/auth/login
```

Params:

| URL | params.slug |
|-----|-------------|
| `/docs` | "" |
| `/docs/api` | "api" |
| `/docs/api/auth` | "api/auth" |

---

# Route Groups

Folders wrapped in parentheses are ignored in URLs.

```
src/(admin)/users.ht.js
```

URL:

```
/users
```

---

# Index Routes

Files named `index.ht.js` map to the parent route.

```
src/blog/index.ht.js        -> /blog
src/blog/[slug]/index.ht.js -> /blog/my-post
```

---

# Static Params

Dynamic routes can export `generateStaticParams`.

```js
export function generateStaticParams() {
  return [
    { slug: "hello-world" },
    { slug: "vite-routing" }
  ]
}
```

---

# Data Loading

Pages can export a `data()` function.

```js
export async function data({ params }) {
  return { title: params.slug }
}
```

---

# Layouts

Reusable layout functions work naturally with HT.js.

``` js
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

---

# Plugin Options

| Option | Description |
|------|------|
| `pagesDir` | root directory for pages |
| `include` | page glob |
| `exclude` | excluded files |
| `cleanUrls` | `/page/index.html` instead of `/page.html` |
| `renderConcurrency` | parallel rendering |
| `renderBatchSize` | batch size |
| `debug` | enable debug logging |
| `site` | base URL for sitemap |
| `rss` | RSS configuration |

---

# Debug Mode

Enable debug logging when troubleshooting.

```js
htPages({
  debug: true
})
```

Example output:

    [vite-plugin-htjs-pages] discovered entries [...]
    [vite-plugin-htjs-pages] dev pages [...]
    [vite-plugin-htjs-pages] render bundle ...

This helps diagnose routing or build issues without modifying plugin
code.

---

# Automatic Sitemap

A `sitemap.xml` is generated automatically.

```
dist/sitemap.xml
```

---

# Optional RSS Feed

```js
htPages({
  rss: {
    site: "https://example.com",
    title: "My Blog",
    description: "Latest posts",
    routePrefix: "/blog"
  }
})
```

Produces:

```
dist/rss.xml
```

---

# Performance

Large sites can increase concurrency:

```js
htPages({
  renderConcurrency: 16,
  renderBatchSize: 128
})
```

---

# Comparison

| Tool | Focus |
|-----|-----|
| Astro | component‑based SSG |
| Next.js | React SSR framework |
| vite-plugin-htjs-pages | minimal HTML SSG for Vite |

---

# Use Cases

`vite-plugin-htjs-pages` works well for:

-   **Vite static site generation**
-   **File-based routing with Vite**
-   **Generating static HTML with Vite**
-   **Vite blog generators**
-   **Documentation sites**
-   **Minimal static site generators**
-   **HTML‑first Vite projects**

---

# License

MIT
