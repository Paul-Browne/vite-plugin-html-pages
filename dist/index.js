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

// src/dev-server.ts
import fs from "fs";
import path4 from "path";

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

// src/dev-server.ts
function isStaticAssetRequest(url) {
  return url.endsWith(".css") || url.endsWith(".js") || url.endsWith(".mjs") || url.endsWith(".ts") || url.endsWith(".png") || url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".gif") || url.endsWith(".svg") || url.endsWith(".webp") || url.endsWith(".ico") || url.endsWith(".woff") || url.endsWith(".woff2") || url.endsWith(".ttf") || url.endsWith(".otf");
}
function shouldSkipHtmlRouting(url) {
  return url.startsWith("/@vite") || url.startsWith("/@fs/") || url.startsWith("/node_modules/") || url.startsWith("/src/") || url === "/favicon.ico" || isStaticAssetRequest(url);
}
function tryRewriteRootAssetToSrc(server, url) {
  if (!url.startsWith("/")) return null;
  if (!isStaticAssetRequest(url)) return null;
  if (url.startsWith("/src/")) return null;
  const root = server.config.root;
  const candidate = path4.join(root, "src", url.slice(1));
  if (fs.existsSync(candidate)) {
    return `/src/${url.slice(1)}`;
  }
  return null;
}
function shouldUseDynamicRendering(mod) {
  return mod.dynamic === true || mod.prerender === false;
}
function installDevServer(args) {
  const { server, getPages } = args;
  server.middlewares.use(async (req, res, next) => {
    try {
      const originalUrl = req.url ?? "/";
      const url = originalUrl.split("?")[0];
      const rewrittenAssetUrl = tryRewriteRootAssetToSrc(server, url);
      if (rewrittenAssetUrl) {
        req.url = rewrittenAssetUrl + originalUrl.slice(url.length);
        return next();
      }
      if (shouldSkipHtmlRouting(url)) {
        return next();
      }
      const pages = await getPages();
      const page = pages.find((p) => p.routePath === url);
      if (!page) {
        return next();
      }
      const loadModule = await createPageModuleLoader({
        mode: "dev",
        root: server.config.root,
        server
      });
      const mod = await loadModule(page.entryPath, page.relativePath);
      if (!mod) {
        return next();
      }
      if (!shouldUseDynamicRendering(mod) && page.dynamic) {
        return next();
      }
      const html = await renderPage(page, mod, true);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    } catch (error) {
      server.config.logger.error(
        `[${PLUGIN_NAME}] dev server render failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
      );
      next(error);
    }
  });
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

// src/assets.ts
import fs2 from "fs";
import path5 from "path";
var EXTERNAL_URL_RE = /^(?:[a-z]+:)?\/\//i;
function isLocalAssetUrl(url) {
  return !!url && !url.startsWith("data:") && !url.startsWith("mailto:") && !url.startsWith("tel:") && !url.startsWith("#") && !EXTERNAL_URL_RE.test(url);
}
function stripQueryAndHash(url) {
  return url.split("#")[0].split("?")[0];
}
function extractHtmlAssets(html) {
  const assets = [];
  for (const match of html.matchAll(
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  )) {
    assets.push({ kind: "css", url: match[1] });
  }
  for (const match of html.matchAll(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  )) {
    assets.push({ kind: "js", url: match[1] });
  }
  return dedupeExtractedAssets(assets);
}
function dedupeExtractedAssets(assets) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const asset of assets) {
    const key = `${asset.kind}:${asset.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}
function resolveLocalAssetPath(args) {
  const { root, pagesDir, pageDir, url } = args;
  if (!isLocalAssetUrl(url)) return null;
  const cleanUrl = stripQueryAndHash(url);
  let abs;
  if (cleanUrl.startsWith("/")) {
    abs = path5.join(root, pagesDir, cleanUrl.slice(1));
  } else if (cleanUrl.startsWith(`${pagesDir}/`)) {
    abs = path5.join(root, cleanUrl);
  } else {
    const baseDir = pageDir ?? path5.join(root, pagesDir);
    abs = path5.resolve(baseDir, cleanUrl);
  }
  return fs2.existsSync(abs) ? abs : null;
}
function emitHtmlAsset(args) {
  const { ctx, kind, absolutePath } = args;
  if (kind === "css" || kind === "js") {
    return ctx.emitFile({
      type: "chunk",
      id: absolutePath,
      name: path5.basename(absolutePath, path5.extname(absolutePath))
    });
  }
  throw new Error(`[vite-plugin-html-pages] Unsupported asset kind: ${kind}`);
}
function replaceAllLiteral(input, search, replacement) {
  return input.split(search).join(replacement);
}
function rewriteHtmlAssetUrls(html, replacements) {
  let out = html;
  for (const [originalUrl, builtUrl] of replacements) {
    out = replaceAllLiteral(
      out,
      `href="${originalUrl}"`,
      `href="${builtUrl}"`
    );
    out = replaceAllLiteral(
      out,
      `href='${originalUrl}'`,
      `href='${builtUrl}'`
    );
    out = replaceAllLiteral(
      out,
      `src="${originalUrl}"`,
      `src="${builtUrl}"`
    );
    out = replaceAllLiteral(
      out,
      `src='${originalUrl}'`,
      `src='${builtUrl}'`
    );
  }
  return out;
}
async function collectHtmlAssetRefs(args) {
  const { ctx, root, pagesDir, htmlByPageKey } = args;
  const refs = /* @__PURE__ */ new Map();
  for (const { html, pageDir } of htmlByPageKey.values()) {
    const assets = extractHtmlAssets(html);
    for (const asset of assets) {
      const abs = resolveLocalAssetPath({
        root,
        pagesDir,
        pageDir,
        url: asset.url
      });
      if (!abs) continue;
      const key = `${asset.kind}:${asset.url}`;
      if (refs.has(key)) continue;
      const refId = emitHtmlAsset({
        ctx,
        kind: asset.kind,
        absolutePath: abs
      });
      refs.set(key, {
        kind: asset.kind,
        originalUrl: asset.url,
        absolutePath: abs,
        refId
      });
    }
  }
  return refs;
}
function buildHtmlAssetReplacementMap(args) {
  const { ctx, refs, bundle } = args;
  const replacements = /* @__PURE__ */ new Map();
  for (const ref of refs.values()) {
    if (ref.kind === "js") {
      const fileName = ctx.getFileName(ref.refId);
      replacements.set(ref.originalUrl, `/${fileName}`);
      continue;
    }
    if (ref.kind === "css") {
      const jsEntryFile = ctx.getFileName(ref.refId);
      const jsChunk = bundle[jsEntryFile];
      if (jsChunk && jsChunk.type === "chunk" && "viteMetadata" in jsChunk && jsChunk.viteMetadata?.importedCss && jsChunk.viteMetadata.importedCss.size > 0) {
        const cssFile = [...jsChunk.viteMetadata.importedCss][0];
        replacements.set(ref.originalUrl, `/${cssFile}`);
        continue;
      }
      replacements.set(ref.originalUrl, `/${jsEntryFile}`);
    }
  }
  return replacements;
}

// src/plugin.ts
import fs3 from "fs";
import path6 from "path";
var hasWarnedESM = false;
function warnIfNotESM(root) {
  try {
    const pkgPath = path6.join(root, "package.json");
    if (!fs3.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs3.readFileSync(pkgPath, "utf8"));
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
  let htmlAssetRefs = /* @__PURE__ */ new Map();
  const cleanUrls = options.cleanUrls ?? true;
  const pagesDir = options.pagesDir ?? "src";
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
      if (server) {
        return;
      }
      htmlAssetRefs.clear();
      const { modulesByEntry, pages } = await buildPagesPipeline();
      const htmlByPageKey = /* @__PURE__ */ new Map();
      for (const page of pages) {
        const mod = modulesByEntry.get(page.entryPath);
        if (!mod) {
          throw new Error(
            `[${PLUGIN_NAME}] Missing module for page entry: ${page.entryPath}`
          );
        }
        const html = await renderPage(page, mod, false);
        htmlByPageKey.set(page.entryPath, {
          html,
          pageDir: path6.dirname(page.absolutePath)
        });
      }
      htmlAssetRefs = await collectHtmlAssetRefs({
        ctx: this,
        root,
        pagesDir,
        htmlByPageKey
      });
      logDebug(
        options.debug,
        "collected html assets",
        [...htmlAssetRefs.values()].map((ref) => ({
          kind: ref.kind,
          originalUrl: ref.originalUrl,
          absolutePath: ref.absolutePath
        }))
      );
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
        const assetReplacements = buildHtmlAssetReplacementMap({
          ctx: this,
          refs: htmlAssetRefs,
          bundle
        });
        logDebug(
          options.debug,
          "asset replacements",
          [...assetReplacements.entries()]
        );
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
                let html = await renderPage(page, mod, false);
                html = rewriteHtmlAssetUrls(html, assetReplacements);
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
          let html = await renderPage(notFoundPage, mod, false);
          html = rewriteHtmlAssetUrls(html, assetReplacements);
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
        if (sitemapBase && sitemapRoutes.length > 0) {
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
import fs4 from "fs/promises";
import path7 from "path";
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
  return path7.join(process.cwd(), CACHE_DIR_NAME, "fetch", `${cacheKey}.json`);
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
    await fs4.mkdir(path7.dirname(filePath), { recursive: true });
    if (!options.forceRefresh) {
      try {
        const raw = await fs4.readFile(filePath, "utf8");
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
    await fs4.writeFile(filePath, JSON.stringify(record), "utf8");
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