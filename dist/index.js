// src/plugin.ts
import pLimit from "p-limit";

// src/discover.ts
import path2 from "path";

// src/path-utils.ts
import path from "path";
function toPosix(value) {
  return value.replace(/\\/g, "/");
}
function normalizeFsPath(value) {
  return path.normalize(value);
}
function normalizeRoutePath(value) {
  const normalized = toPosix(value).replace(/\/+/g, "/");
  if (!normalized || normalized === "/") return "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
function stripPageSuffix(filePath, extensions) {
  const normalized = toPosix(filePath);
  const match = [...extensions].sort((a, b) => b.length - a.length).find((ext) => normalized.endsWith(ext));
  if (!match) return normalized;
  return normalized.slice(0, -match.length);
}

// src/route-utils.ts
var DYNAMIC_SEGMENT_RE = /\[([A-Za-z0-9_]+)\]/g;
var CATCH_ALL_SEGMENT_RE = /\[\.\.\.([A-Za-z0-9_]+)\]/g;
var OPTIONAL_CATCH_ALL_SEGMENT_RE = /\[\.\.\.([A-Za-z0-9_]+)\]\?/g;
var ANY_PARAM_RE = /\[(?:\.\.\.)?([A-Za-z0-9_]+)\]\??/g;
var ROUTE_GROUP_RE = /(^|\/)\(([^)]+)\)(?=\/|$)/g;
function getParamNames(relativeFromPagesDir) {
  return [...relativeFromPagesDir.matchAll(ANY_PARAM_RE)].map((m) => m[1]);
}
function isDynamicPage(relativeFromPagesDir) {
  return /\[(?:\.\.\.)?[A-Za-z0-9_]+\]\??/.test(relativeFromPagesDir);
}
function toRoutePattern(relativeFromPagesDir, extensions) {
  const noExt = stripPageSuffix(toPosix(relativeFromPagesDir), extensions);
  const withoutGroups = noExt.replace(ROUTE_GROUP_RE, "$1");
  const withoutIndex = withoutGroups.replace(/\/index$/i, "").replace(/^index$/i, "");
  const raw = withoutIndex.replace(OPTIONAL_CATCH_ALL_SEGMENT_RE, "*?:$1").replace(CATCH_ALL_SEGMENT_RE, "*:$1").replace(DYNAMIC_SEGMENT_RE, ":$1");
  return normalizeRoutePath(raw || "/");
}
function fillParams(pattern, params) {
  const result = pattern.replace(/\*\?:([A-Za-z0-9_]+)/g, (_, key) => {
    const value = params[key];
    if (value == null || value === "") {
      return "";
    }
    return String(value).split("/").map((part) => encodeURIComponent(part)).join("/");
  }).replace(/\*:([A-Za-z0-9_]+)/g, (_, key) => {
    if (!(key in params)) {
      throw new Error(`Missing catch-all route param "${key}"`);
    }
    return String(params[key]).split("/").map((part) => encodeURIComponent(part)).join("/");
  }).replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    if (!(key in params)) {
      throw new Error(`Missing route param "${key}"`);
    }
    return encodeURIComponent(params[key]);
  });
  return normalizeRoutePath(result || "/");
}
function fileNameFromRoute(routePath, cleanUrls) {
  const normalized = normalizeRoutePath(routePath);
  if (normalized === "/") return "index.html";
  const base = normalized.slice(1);
  return cleanUrls ? `${base}/index.html` : `${base}.html`;
}
function expandStaticPaths(basePage, rows, cleanUrls) {
  return rows.map((row) => {
    const params = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, String(v)])
    );
    const routePath = fillParams(basePage.routePattern, params);
    return {
      ...basePage,
      routePath,
      fileName: fileNameFromRoute(routePath, cleanUrls),
      params
    };
  });
}
function routeMatch(pattern, urlPath) {
  const a = normalizeRoutePath(pattern).split("/").filter(Boolean);
  const b = normalizeRoutePath(urlPath).split("/").filter(Boolean);
  const params = {};
  for (let i = 0; i < a.length; i++) {
    const patternSeg = a[i];
    const urlSeg = b[i];
    if (patternSeg.startsWith("*?:")) {
      params[patternSeg.slice(3)] = i < b.length ? b.slice(i).map(decodeURIComponent).join("/") : "";
      return params;
    }
    if (patternSeg.startsWith("*:")) {
      const rest = b.slice(i);
      if (rest.length === 0) return null;
      params[patternSeg.slice(2)] = rest.map(decodeURIComponent).join("/");
      return params;
    }
    if (!urlSeg) return null;
    if (patternSeg.startsWith(":")) {
      params[patternSeg.slice(1)] = decodeURIComponent(urlSeg);
      continue;
    }
    if (patternSeg !== urlSeg) return null;
  }
  return a.length === b.length ? params : null;
}
function compareRoutePriority(a, b) {
  const aSegs = normalizeRoutePath(a).split("/").filter(Boolean);
  const bSegs = normalizeRoutePath(b).split("/").filter(Boolean);
  const len = Math.max(aSegs.length, bSegs.length);
  for (let i = 0; i < len; i++) {
    const aa = aSegs[i];
    const bb = bSegs[i];
    if (aa == null) return 1;
    if (bb == null) return -1;
    const aOptionalCatchAll = aa.startsWith("*?:");
    const bOptionalCatchAll = bb.startsWith("*?:");
    if (aOptionalCatchAll !== bOptionalCatchAll) {
      return aOptionalCatchAll ? 1 : -1;
    }
    const aCatchAll = aa.startsWith("*:");
    const bCatchAll = bb.startsWith("*:");
    if (aCatchAll !== bCatchAll) {
      return aCatchAll ? 1 : -1;
    }
    const aDynamic = aa.startsWith(":");
    const bDynamic = bb.startsWith(":");
    if (aDynamic !== bDynamic) {
      return aDynamic ? 1 : -1;
    }
  }
  return bSegs.length - aSegs.length;
}

// src/constants.ts
var PLUGIN_NAME = "vite-plugin-html-pages";
var VIRTUAL_BUILD_ENTRY_ID = `\0${PLUGIN_NAME}:build-entry`;
var VIRTUAL_MANIFEST_ID = `\0virtual:${PLUGIN_NAME}-manifest`;
var CACHE_DIR_NAME = `node_modules/.cache/${PLUGIN_NAME}`;

// src/discover.ts
function buildDefaultIncludeGlobs(pagesDir, pageExtensions) {
  return pageExtensions.map((ext) => {
    const cleanExt = ext.startsWith(".") ? ext.slice(1) : ext;
    return `${pagesDir}/**/*.${cleanExt}`;
  });
}
async function discoverEntryPages(root, options) {
  const fgModule = await import("fast-glob");
  const fg = fgModule.default ?? fgModule;
  const pagesDir = options.pagesDir ?? "src";
  const pageExtensions = options.pageExtensions?.length ? options.pageExtensions : [".ht.js", ".html.js", ".ht.ts", ".html.ts"];
  const include = Array.isArray(options.include) ? options.include : options.include ? [options.include] : buildDefaultIncludeGlobs(pagesDir, pageExtensions);
  const exclude = Array.isArray(options.exclude) ? options.exclude : options.exclude ? [options.exclude] : [];
  const pagesRoot = normalizeFsPath(path2.join(root, pagesDir));
  const files = await fg.glob(include, {
    cwd: root,
    ignore: exclude,
    absolute: true
  });
  return files.sort().map((absolutePath) => {
    const entryPath = normalizeFsPath(absolutePath);
    const relativePath = toPosix(path2.relative(root, entryPath));
    const relativeFromPagesDir = toPosix(path2.relative(pagesRoot, entryPath));
    if (relativeFromPagesDir.startsWith("../") || relativeFromPagesDir === "..") {
      throw new Error(
        `[${PLUGIN_NAME}] Page is outside pagesDir: ${entryPath} (pagesDir: ${pagesDir})`
      );
    }
    const dynamic = isDynamicPage(relativeFromPagesDir);
    const routePattern = toRoutePattern(relativeFromPagesDir, pageExtensions);
    return {
      id: entryPath,
      entryPath,
      absolutePath: entryPath,
      relativePath,
      routePattern,
      routePath: routePattern,
      fileName: "",
      dynamic,
      paramNames: getParamNames(relativeFromPagesDir),
      params: {}
    };
  });
}

// src/errors.ts
function invalidHtmlReturn(page, value) {
  return new Error(
    `[${PLUGIN_NAME}] Page "${page.relativePath}" must resolve to an HTML string, got ${typeof value}`
  );
}
function missingDefaultExport(page) {
  return new Error(
    `[${PLUGIN_NAME}] Page "${page.relativePath}" does not export a default renderer`
  );
}
function pageError(page, cause) {
  const message = `[${PLUGIN_NAME}] Failed to render "${page.relativePath}" at route "${page.routePath}"`;
  if (cause instanceof Error) {
    const err = new Error(`${message}: ${cause.message}`);
    if (cause.stack) {
      err.stack = `${err.stack}
Caused by:
${cause.stack}`;
    }
    return err;
  }
  return new Error(`${message}: ${String(cause)}`);
}

// src/render-runtime.ts
async function renderPage(page, mod, dev = false) {
  const ctx = {
    page,
    params: page.params,
    dev
  };
  try {
    if (typeof mod.data === "function") {
      ctx.data = await mod.data(ctx);
    }
    const entry = mod.default;
    if (entry == null) {
      throw missingDefaultExport(page);
    }
    const html = typeof entry === "function" ? await entry(ctx) : entry;
    if (typeof html !== "string") {
      throw invalidHtmlReturn(page, html);
    }
    return html;
  } catch (error) {
    throw pageError(page, error);
  }
}

// src/dev-server.ts
function isDynamicOnly(mod) {
  return mod.dynamic === true || mod.prerender === false;
}
function installDevServer(args) {
  const { server, getPages, getEntries } = args;
  server.middlewares.use(async (req, res, next) => {
    try {
      if (!req.url || req.method !== "GET") return next();
      const pathname = req.url.split("?")[0];
      const pages = await getPages();
      const staticPage = pages.find((p) => p.routePath === pathname);
      if (staticPage) {
        const mod = await server.ssrLoadModule(
          `/${staticPage.relativePath}`
        );
        const html = await renderPage(staticPage, mod, true);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
        return;
      }
      const entries = await getEntries();
      for (const entry of entries) {
        const mod = await server.ssrLoadModule(
          `/${entry.relativePath}`
        );
        if (!isDynamicOnly(mod)) continue;
        const params = routeMatch(entry.routePattern, pathname);
        if (!params) continue;
        const page = {
          ...entry,
          routePath: pathname,
          fileName: "",
          params
        };
        const html = await renderPage(page, mod, true);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(html);
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });
}

// src/module-loader.ts
import path3 from "path";
import { createServer } from "vite";
var buildServer = null;
async function createPageModuleLoader(args) {
  const { mode, root, server } = args;
  if (mode === "dev") {
    if (!server) {
      throw new Error("[vite-plugin-html-pages] dev server not available");
    }
    return async (_entryPath, relativePath) => {
      const mod = await server.ssrLoadModule(`/${relativePath}`);
      return mod;
    };
  }
  if (!buildServer) {
    const config = {
      root,
      configFile: false,
      logLevel: "error",
      appType: "custom",
      server: {
        middlewareMode: true
      }
    };
    buildServer = await createServer(config);
  }
  return async (entryPath) => {
    const relativePath = "/" + path3.relative(root, entryPath).replace(/\\/g, "/");
    const mod = await buildServer.ssrLoadModule(relativePath);
    return mod;
  };
}
async function closePageModuleLoader() {
  if (buildServer) {
    await buildServer.close();
    buildServer = null;
  }
}

// src/page-index.ts
async function buildPageIndex(args) {
  const { entries, modulesByEntry, cleanUrls } = args;
  const pages = [];
  for (const entry of entries) {
    const mod = modulesByEntry.get(entry.entryPath) ?? {};
    if (entry.dynamic) {
      const rows = (mod.generateStaticParams ? await mod.generateStaticParams() : []) ?? [];
      pages.push(
        ...expandStaticPaths(
          {
            id: entry.id,
            entryPath: entry.entryPath,
            absolutePath: entry.absolutePath,
            relativePath: entry.relativePath,
            routePattern: entry.routePattern,
            dynamic: entry.dynamic,
            paramNames: entry.paramNames
          },
          Array.isArray(rows) ? rows : [],
          cleanUrls
        )
      );
    } else {
      pages.push({
        ...entry,
        routePath: entry.routePattern,
        fileName: fileNameFromRoute(entry.routePattern, cleanUrls),
        params: {}
      });
    }
  }
  pages.sort((a, b) => compareRoutePriority(a.routePattern, b.routePattern));
  const seenRoutes = /* @__PURE__ */ new Map();
  for (const page of pages) {
    const existing = seenRoutes.get(page.routePath);
    if (existing) {
      throw new Error(
        `[${PLUGIN_NAME}] Duplicate route generated: "${page.routePath}" from "${existing.relativePath}" and "${page.relativePath}"`
      );
    }
    seenRoutes.set(page.routePath, page);
  }
  return pages;
}

// src/plugin.ts
import fs from "fs";
import path4 from "path";
var hasWarnedESM = false;
function warnIfNotESM(root) {
  try {
    const pkgPath = path4.join(root, "package.json");
    if (!fs.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.type !== "module") {
      console.warn(
        `[${PLUGIN_NAME}] \u26A0\uFE0F It is recommended to add "type": "module" to your package.json for optimal performance and to avoid Node ESM warnings.`
      );
    }
  } catch {
  }
}
function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
function htPages(options = {}) {
  let root = process.cwd();
  let server = null;
  let devPages = [];
  const cleanUrls = options.cleanUrls ?? true;
  function logDebug(enabled, ...args) {
    if (!enabled) return;
    console.log(`[${PLUGIN_NAME}]`, ...args);
  }
  async function loadDevPages() {
    const entries = await discoverEntryPages(root, options);
    const modulesByEntry = /* @__PURE__ */ new Map();
    logDebug(
      options.debug,
      "discovered entries",
      entries.map((e) => e.relativePath)
    );
    if (!server) return [];
    const loadModule = await createPageModuleLoader({
      mode: "dev",
      root,
      server
    });
    for (const entry of entries) {
      const mod = await loadModule(entry.entryPath, entry.relativePath);
      modulesByEntry.set(entry.entryPath, mod);
    }
    devPages = await buildPageIndex({
      entries,
      modulesByEntry,
      cleanUrls
    });
    logDebug(
      options.debug,
      "dev pages",
      devPages.map((p) => `${p.routePath} -> ${p.relativePath}`)
    );
    return devPages;
  }
  async function buildPagesPipeline() {
    const entries = await discoverEntryPages(root, options);
    const modulesByEntry = /* @__PURE__ */ new Map();
    const loadModule = await createPageModuleLoader({
      mode: "build",
      root
    });
    for (const entry of entries) {
      const mod = await loadModule(entry.entryPath, entry.relativePath);
      modulesByEntry.set(entry.entryPath, mod);
    }
    const pages = await buildPageIndex({
      entries,
      modulesByEntry,
      cleanUrls
    });
    return { entries, modulesByEntry, pages };
  }
  return {
    name: PLUGIN_NAME,
    config(userConfig, env) {
      if (env.command !== "build") return;
      const hasExplicitInput = userConfig.build?.rollupOptions?.input != null;
      if (hasExplicitInput) return;
      return {
        build: {
          rollupOptions: {
            input: VIRTUAL_BUILD_ENTRY_ID
          }
        }
      };
    },
    resolveId(id) {
      if (id === VIRTUAL_BUILD_ENTRY_ID) return id;
      return null;
    },
    load(id) {
      if (id === VIRTUAL_BUILD_ENTRY_ID) {
        return "export default {};";
      }
      return null;
    },
    configResolved(resolved) {
      root = resolved.root;
      if (!hasWarnedESM) {
        warnIfNotESM(root);
        hasWarnedESM = true;
      }
    },
    async buildStart() {
      const entries = await discoverEntryPages(root, options);
      for (const entry of entries) {
        this.addWatchFile(entry.entryPath);
      }
    },
    configureServer(_server) {
      server = _server;
      installDevServer({
        server,
        getPages: async () => {
          if (devPages.length > 0) return devPages;
          return loadDevPages();
        },
        getEntries: async () => discoverEntryPages(root, options)
      });
      loadDevPages().catch((error) => {
        server?.config.logger.error(
          `[${PLUGIN_NAME}] loadDevPages failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
        );
      });
    },
    async handleHotUpdate(ctx) {
      if (!server) return;
      logDebug(options.debug, "file changed", ctx.file);
      await loadDevPages();
      return void 0;
    },
    async generateBundle(_, bundle) {
      try {
        const { modulesByEntry, pages } = await buildPagesPipeline();
        logDebug(
          options.debug,
          "emitting pages",
          pages.map((p) => p.fileName)
        );
        const limit = pLimit(options.renderConcurrency ?? 8);
        const batchSize = options.renderBatchSize ?? Math.max(options.renderConcurrency ?? 8, 32);
        for (const batch of chunkArray(pages, batchSize)) {
          await Promise.all(
            batch.map(
              (page) => limit(async () => {
                const mod = modulesByEntry.get(page.entryPath);
                if (!mod) {
                  throw new Error(
                    `[${PLUGIN_NAME}] Missing module for page entry: ${page.entryPath}`
                  );
                }
                const html = await renderPage(page, mod, false);
                this.emitFile({
                  type: "asset",
                  fileName: options.mapOutputPath?.(page) ?? page.fileName,
                  source: html
                });
              })
            )
          );
        }
        const notFoundPage = pages.find((p) => p.routePath === "/404");
        if (notFoundPage) {
          const mod = modulesByEntry.get(notFoundPage.entryPath);
          if (!mod) {
            throw new Error(
              `[${PLUGIN_NAME}] Missing module for 404 page entry: ${notFoundPage.entryPath}`
            );
          }
          const html = await renderPage(notFoundPage, mod, false);
          this.emitFile({
            type: "asset",
            fileName: "404.html",
            source: html
          });
          logDebug(options.debug, "generated 404.html from user page");
        } else {
          const default404 = `<!doctype html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>404 - Page Not Found</title>
            <style>
              :root {
                color-scheme: light dark;
              }
              body {
                margin: 0;
                font-family: system-ui, sans-serif;
                min-height: 100vh;
                display: grid;
                place-items: center;
                padding: 2rem;
              }
              main {
                max-width: 40rem;
                text-align: center;
              }
              h1 {
                font-size: 3rem;
                margin: 0 0 1rem;
              }
              p {
                margin: 0.5rem 0;
                line-height: 1.5;
              }
              a {
                color: inherit;
              }
            </style>
          </head>
          <body>
            <main>
              <h1>404</h1>
              <p>Page not found.</p>
              <p><a href="/">Go back home</a></p>
            </main>
          </body>
        </html>
        `;
          this.emitFile({
            type: "asset",
            fileName: "404.html",
            source: default404
          });
          logDebug(options.debug, "generated default 404.html");
        }
        const sitemapBase = options.site ?? "";
        const sitemapRoutes = [...new Set(pages.map((p) => p.routePath))].filter(
          (route) => !route.includes(":") && !route.includes("*")
        );
        if (sitemapRoutes.length > 0) {
          const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapRoutes.map((route) => `  <url><loc>${sitemapBase}${route}</loc></url>`).join("\n")}
</urlset>
`;
          this.emitFile({
            type: "asset",
            fileName: "sitemap.xml",
            source: sitemap
          });
          logDebug(options.debug, "generated sitemap.xml");
        }
        if (options.rss?.site) {
          const routePrefix = options.rss.routePrefix ?? "/blog";
          const rssItems = pages.filter((page) => page.routePath.startsWith(routePrefix)).map((page) => {
            const url = `${options.rss.site}${page.routePath}`;
            return `  <item>
    <title>${page.routePath}</title>
    <link>${url}</link>
    <guid>${url}</guid>
  </item>`;
          }).join("\n");
          const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${options.rss.title ?? PLUGIN_NAME}</title>
  <link>${options.rss.site}</link>
  <description>${options.rss.description ?? "RSS feed"}</description>
${rssItems}
</channel>
</rss>
`;
          this.emitFile({
            type: "asset",
            fileName: "rss.xml",
            source: rss
          });
          logDebug(options.debug, "generated rss.xml");
        }
        for (const [fileName, output] of Object.entries(bundle)) {
          if (output.type === "chunk" && output.facadeModuleId === VIRTUAL_BUILD_ENTRY_ID) {
            delete bundle[fileName];
          }
        }
      } finally {
        await closePageModuleLoader();
      }
    }
  };
}

// src/fetch-cache.ts
import fs2 from "fs/promises";
import path5 from "path";
import { createHash } from "crypto";
var memoryCache = /* @__PURE__ */ new Map();
function createDefaultCacheKey(input, init) {
  const raw = JSON.stringify({
    url: String(input),
    method: init?.method ?? "GET",
    headers: init?.headers ?? {},
    body: init?.body ?? null
  });
  return createHash("sha256").update(raw).digest("hex");
}
function getCacheFilePath(cacheKey) {
  return path5.join(process.cwd(), CACHE_DIR_NAME, "fetch", `${cacheKey}.json`);
}
function getEffectiveCacheMode(mode) {
  if (mode === "memory" || mode === "fs" || mode === "none") {
    return mode;
  }
  return process.env.NODE_ENV === "production" ? "fs" : "memory";
}
function toResponse(cached) {
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers: cached.headers
  });
}
function isFresh(cached, maxAgeSeconds) {
  const ageSeconds = (Date.now() - cached.timestamp) / 1e3;
  return ageSeconds <= maxAgeSeconds;
}
async function fetchWithCache(input, init, options = {}) {
  const maxAge = options.maxAge ?? 60 * 60;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && !options.cacheKey) {
    return fetch(input, init);
  }
  const cacheMode = getEffectiveCacheMode(options.cache);
  const cacheKey = options.cacheKey ?? createDefaultCacheKey(input, init);
  if (cacheMode === "none") {
    return fetch(input, init);
  }
  if (cacheMode === "memory" && !options.forceRefresh) {
    const cached = memoryCache.get(cacheKey);
    if (cached && isFresh(cached, maxAge)) {
      return toResponse(cached);
    }
  }
  const filePath = getCacheFilePath(cacheKey);
  if (cacheMode === "fs") {
    await fs2.mkdir(path5.dirname(filePath), { recursive: true });
    if (!options.forceRefresh) {
      try {
        const raw = await fs2.readFile(filePath, "utf8");
        const cached = JSON.parse(raw);
        if (isFresh(cached, maxAge)) {
          return toResponse(cached);
        }
      } catch {
      }
    }
  }
  const res = await fetch(input, init);
  const body = await res.text();
  const record = {
    timestamp: Date.now(),
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()],
    body
  };
  if (cacheMode === "memory") {
    memoryCache.set(cacheKey, record);
  } else if (cacheMode === "fs") {
    await fs2.writeFile(filePath, JSON.stringify(record), "utf8");
  }
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });
}
export {
  htPages as default,
  fetchWithCache
};
//# sourceMappingURL=index.js.map