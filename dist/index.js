// src/plugin.ts
import fs4 from "fs";
import path7 from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { transform as esbuildTransform } from "esbuild";
import pLimit from "p-limit";

// src/constants.ts
var PLUGIN_NAME = "vite-plugin-html-pages";
var VIRTUAL_BUILD_ENTRY_ID = `\0${PLUGIN_NAME}:build-entry`;
var VIRTUAL_PAGE_HELPER_ID = `${PLUGIN_NAME}/page`;
var RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX = `\0${PLUGIN_NAME}/page:`;
var VIRTUAL_MANIFEST_ID = `\0virtual:${PLUGIN_NAME}-manifest`;
var CACHE_DIR_NAME = `node_modules/.cache/${PLUGIN_NAME}`;
var VIRTUAL_JSX_RUNTIME_ID = `${PLUGIN_NAME}/jsx-runtime`;
var VIRTUAL_JSX_DEV_RUNTIME_ID = `${PLUGIN_NAME}/jsx-dev-runtime`;
var RESOLVED_VIRTUAL_JSX_RUNTIME_ID = `\0${VIRTUAL_JSX_RUNTIME_ID}`;
var RESOLVED_VIRTUAL_JSX_DEV_RUNTIME_ID = `\0${VIRTUAL_JSX_DEV_RUNTIME_ID}`;

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
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash !== "/" && withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
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
var ROUTE_GROUP_RE = /(^|\/)\(([^)]+)\)(?=\/|$)/g;
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
function encodePathParts(parts) {
  return parts.map((part) => encodeURIComponent(part)).join("/");
}
function normalizeCatchAllValue(value) {
  if (Array.isArray(value)) {
    return value.map((part) => String(part)).filter(Boolean);
  }
  if (value === "") {
    return [];
  }
  return String(value).split("/").filter(Boolean);
}
function normalizePageParams(params) {
  const normalized = {};
  for (const [key, value] of Object.entries(params)) {
    normalized[key] = Array.isArray(value) ? value.map((part) => String(part)) : String(value);
  }
  return normalized;
}
function fillParams(pattern, params) {
  const result = pattern.replace(/\*\?:([A-Za-z0-9_]+)/g, (_, key) => {
    const value = params[key];
    if (value == null) {
      return "";
    }
    const parts = normalizeCatchAllValue(value);
    if (parts.length === 0) {
      return "";
    }
    return encodePathParts(parts);
  }).replace(/\*:([A-Za-z0-9_]+)/g, (_, key) => {
    if (!(key in params)) {
      throw new Error(`Missing catch-all route param "${key}"`);
    }
    const value = params[key];
    const parts = normalizeCatchAllValue(value);
    if (parts.length === 0) {
      throw new Error(`Catch-all route param "${key}" must not be empty`);
    }
    return encodePathParts(parts);
  }).replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    if (!(key in params)) {
      throw new Error(`Missing route param "${key}"`);
    }
    const value = params[key];
    if (Array.isArray(value)) {
      throw new Error(`Route param "${key}" must be a string, received array`);
    }
    return encodeURIComponent(String(value));
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
    const routePath = fillParams(basePage.routePattern, row);
    const params = normalizePageParams(row);
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

// src/route-params.ts
function parseRouteParamSegment(segment) {
  if (segment.startsWith("*?:")) {
    return {
      name: segment.slice(3),
      type: "optional-catch-all"
    };
  }
  if (segment.startsWith("*:")) {
    return {
      name: segment.slice(2),
      type: "catch-all"
    };
  }
  if (segment.startsWith(":")) {
    return {
      name: segment.slice(1),
      type: "single"
    };
  }
  return null;
}
function extractRouteParamDefinitions(routePattern) {
  return routePattern.split("/").filter(Boolean).map((segment) => parseRouteParamSegment(segment)).filter((value) => value != null);
}

// src/discover.ts
function buildDefaultIncludeGlobs(pagesDir, pageExtensions) {
  return pageExtensions.map((ext) => {
    const cleanExt = ext.startsWith(".") ? ext.slice(1) : ext;
    return `${pagesDir}/**/*.${cleanExt}`;
  });
}
async function discoverEntryPages(root, options) {
  const fgModule = await import("fast-glob");
  const fg2 = fgModule.default ?? fgModule;
  const pagesDir = options.pagesDir ?? "src";
  const pageExtensions = options.pageExtensions?.length ? options.pageExtensions : [".ht.js", ".html.js", ".ht.ts", ".html.ts", ".ht.jsx", ".html.jsx", ".ht.tsx", ".html.tsx"];
  const include = Array.isArray(options.include) ? options.include : options.include ? [options.include] : buildDefaultIncludeGlobs(pagesDir, pageExtensions);
  const exclude = Array.isArray(options.exclude) ? options.exclude : options.exclude ? [options.exclude] : [];
  const pagesRoot = normalizeFsPath(path2.join(root, pagesDir));
  const files = await fg2.glob(include, {
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
    const paramDefinitions = extractRouteParamDefinitions(routePattern);
    return {
      id: entryPath,
      entryPath,
      absolutePath: entryPath,
      relativePath,
      routePattern,
      routePath: routePattern,
      fileName: "",
      dynamic,
      paramNames: paramDefinitions.map((p) => p.name),
      paramDefinitions,
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

// src/page-helper-generator.ts
function paramsTypeFromDefinitions(paramDefinitions) {
  if (paramDefinitions.length === 0) {
    return "{}";
  }
  const fields = paramDefinitions.map((param) => {
    if (param.type === "single") {
      return `${JSON.stringify(param.name)}: string`;
    }
    if (param.type === "catch-all") {
      return `${JSON.stringify(param.name)}: string[]`;
    }
    return `${JSON.stringify(param.name)}?: string[]`;
  });
  return `{ ${fields.join("; ")} }`;
}
function generateTypedPageHelper(page) {
  const paramsType = page ? paramsTypeFromDefinitions(page.paramDefinitions ?? []) : "{}";
  return `
export type PageParams = ${paramsType};

export type StaticParams = PageParams[];

export type DataContext = {
  params: PageParams;
  dev: boolean;
};

export type RenderContext<TData = unknown> = {
  params: PageParams;
  data: TData;
  dev: boolean;
};

export type PageContext<TData = unknown> = {
  params: PageParams;
  data?: TData;
  dev: boolean;
};

export type PageModule<TData = unknown> = {
  generateStaticParams?: () => StaticParams | Promise<StaticParams>;
  data?: (ctx: DataContext) => TData | Promise<TData>;
  render: (ctx: RenderContext<TData>) => any;
};

export function definePage<T extends (ctx: PageContext) => any>(fn: T): T {
  return fn;
}

export function defineData<T extends (ctx: DataContext) => any>(fn: T): T {
  return fn;
}

export function defineStaticParams<
  T extends () => StaticParams | Promise<StaticParams>
>(fn: T): T {
  return fn;
}

export function definePageModule<TData>(
  mod: PageModule<TData>,
): PageModule<TData> {
  return mod;
}
`;
}

// src/module-loader.ts
var buildServer = null;
function isStructuredPageModule(value) {
  return !!value && typeof value === "object" && "render" in value && typeof value.render === "function";
}
function normalizeLoadedPageModule(mod) {
  const pageModule = mod ?? {};
  if (isStructuredPageModule(pageModule.default)) {
    const structured = pageModule.default;
    return {
      default: structured.render,
      data: structured.data,
      generateStaticParams: structured.generateStaticParams,
      dynamic: structured.dynamic,
      prerender: structured.prerender
    };
  }
  return pageModule;
}
async function createPageModuleLoader(args) {
  const { mode, root, server, getPages } = args;
  if (mode === "dev") {
    if (!server) {
      throw new Error("[vite-plugin-html-pages] dev server not available");
    }
    return async (_entryPath, relativePath) => {
      const mod = await server.ssrLoadModule(`/${relativePath}`);
      return normalizeLoadedPageModule(mod);
    };
  }
  if (!getPages) {
    throw new Error(
      "[vite-plugin-html-pages] getPages is required in build mode"
    );
  }
  if (!buildServer) {
    const config = {
      root,
      configFile: false,
      logLevel: "error",
      appType: "custom",
      esbuild: {
        jsx: "automatic",
        jsxImportSource: "vite-plugin-html-pages"
      },
      server: {
        middlewareMode: true
      },
      plugins: [
        {
          name: "vite-plugin-html-pages:page-helper",
          resolveId(id, importer) {
            if (id === VIRTUAL_PAGE_HELPER_ID && importer) {
              return `${RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX}${importer}`;
            }
            return null;
          },
          async load(id) {
            if (!id.startsWith(RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX)) {
              return null;
            }
            const importer = id.slice(
              RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX.length
            );
            const pages = await getPages();
            const normalizedImporter = path3.resolve(importer);
            const page = pages.find(
              (candidate) => path3.resolve(candidate.absolutePath) === normalizedImporter
            );
            return generateTypedPageHelper(page);
          }
        }
      ]
    };
    buildServer = await createServer(config);
  }
  return async (entryPath) => {
    const relativePath = "/" + path3.relative(root, entryPath).replace(/\\/g, "/");
    const mod = await buildServer.ssrLoadModule(relativePath);
    return normalizeLoadedPageModule(mod);
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
function shouldSkipHtmlRouting(url, pagesDir) {
  return url.startsWith("/@vite") || url.startsWith("/@fs/") || url.startsWith("/node_modules/") || url.startsWith(`/${pagesDir}/`) || url === "/favicon.ico" || isStaticAssetRequest(url);
}
function tryRewriteRootAssetToSrc(root, pagesDir, url) {
  if (!url.startsWith("/")) return null;
  if (!isStaticAssetRequest(url)) return null;
  if (url.startsWith(`/${pagesDir}/`)) return null;
  const candidate = path4.join(root, pagesDir, url.slice(1));
  if (fs.existsSync(candidate)) {
    return `/${pagesDir}/${url.slice(1)}`;
  }
  return null;
}
function shouldUseDynamicRendering(mod) {
  return mod.dynamic === true || mod.prerender === false;
}
function installDevServer(args) {
  const { server, root, pagesDir, getPages } = args;
  server.middlewares.use(async (req, res, next) => {
    try {
      const originalUrl = req.url ?? "/";
      const url = originalUrl.split("?")[0];
      const rewrittenAssetUrl = tryRewriteRootAssetToSrc(root, pagesDir, url);
      if (rewrittenAssetUrl) {
        req.url = rewrittenAssetUrl + originalUrl.slice(url.length);
        return next();
      }
      if (shouldSkipHtmlRouting(url, pagesDir)) {
        return next();
      }
      const pages = await getPages();
      const page = pages.find((p) => p.routePath === url);
      if (!page) {
        return next();
      }
      const loadModule = await createPageModuleLoader({
        mode: "dev",
        root,
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
      const transformedHtml = await server.transformIndexHtml(
        url,
        html,
        req.originalUrl
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(transformedHtml);
    } catch (error) {
      server.config.logger.error(
        `[${PLUGIN_NAME}] dev server render failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
      );
      next(error);
    }
  });
}

// src/html-asset-validator.ts
import fs2 from "fs";
import path5 from "path";
function stripQueryAndHash(url) {
  return url.split("#")[0].split("?")[0];
}
function isLocalRootUrl(url) {
  return !!url && url.startsWith("/") && !url.startsWith("//");
}
function fileExistsForPublicUrl(root, pagesDir, url) {
  const clean = stripQueryAndHash(url).slice(1);
  const fromSrc = path5.join(root, pagesDir, clean);
  if (fs2.existsSync(fromSrc)) return true;
  const fromPublic = path5.join(root, "public", clean);
  if (fs2.existsSync(fromPublic)) return true;
  return false;
}
function collectScriptSrcs(html) {
  const out = [];
  for (const match of html.matchAll(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  )) {
    out.push(match[1]);
  }
  return out;
}
function collectStylesheetHrefs(html) {
  const out = [];
  for (const match of html.matchAll(
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  )) {
    out.push(match[1]);
  }
  return out;
}
function collectLiteralDynamicImports(html) {
  const out = [];
  for (const match of html.matchAll(
    /import\s*\(\s*["']([^"'`]+)["']\s*\)/gi
  )) {
    out.push(match[1]);
  }
  return out;
}
function unique(values) {
  return [...new Set(values)];
}
function formatPageLabel(pageLabel) {
  return pageLabel ? ` (${pageLabel})` : "";
}
function missingAssetMessage(args) {
  const { pluginName, kind, url, root, pagesDir, pageLabel } = args;
  const clean = stripQueryAndHash(url).slice(1);
  const pageSuffix = formatPageLabel(pageLabel);
  return `[${pluginName}] Missing ${kind}${pageSuffix}: ${url}
Expected one of:
- ${path5.join(root, pagesDir, clean)}
- ${path5.join(root, "public", clean)}`;
}
function reportMissing(args) {
  const message = missingAssetMessage(args);
  if (args.mode === "warn") {
    console.warn(`\u26A0\uFE0F ${message}`);
    return;
  }
  throw new Error(message);
}
function validateHtmlAssetReferences(options) {
  const {
    root,
    pagesDir,
    html,
    pluginName,
    pageLabel,
    missingAssets = "error"
  } = options;
  const scriptSrcs = unique(collectScriptSrcs(html)).filter(isLocalRootUrl);
  const stylesheetHrefs = unique(collectStylesheetHrefs(html)).filter(isLocalRootUrl);
  const literalDynamicImports = unique(collectLiteralDynamicImports(html)).filter(
    isLocalRootUrl
  );
  for (const url of scriptSrcs) {
    if (!fileExistsForPublicUrl(root, pagesDir, url)) {
      reportMissing({
        mode: missingAssets,
        pluginName,
        kind: "JavaScript asset",
        url,
        root,
        pagesDir,
        pageLabel
      });
    }
  }
  for (const url of stylesheetHrefs) {
    if (!fileExistsForPublicUrl(root, pagesDir, url)) {
      reportMissing({
        mode: missingAssets,
        pluginName,
        kind: "stylesheet asset",
        url,
        root,
        pagesDir,
        pageLabel
      });
    }
  }
  for (const url of literalDynamicImports) {
    if (!fileExistsForPublicUrl(root, pagesDir, url)) {
      console.warn(
        `\u26A0\uFE0F ${missingAssetMessage({
          pluginName,
          kind: "literal dynamic import",
          url,
          root,
          pagesDir,
          pageLabel
        })}`
      );
    }
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
            paramNames: entry.paramNames,
            paramDefinitions: entry.paramDefinitions
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

// src/static-assets.ts
import fs3 from "fs/promises";
import path6 from "path";
import fg from "fast-glob";
import * as esbuild from "esbuild";
import fsSync from "fs";
function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}
function hasAnySuffix(value, suffixes) {
  return suffixes.some((suffix) => value.endsWith(suffix));
}
function shouldIgnoreFile(rel) {
  return rel.endsWith(".d.ts") || rel.endsWith(".map") || rel.endsWith(".tsbuildinfo") || rel.startsWith(".") || rel.includes("/.");
}
function isProcessableAsset(rel) {
  return rel.endsWith(".js") || rel.endsWith(".mjs") || rel.endsWith(".ts") || rel.endsWith(".css");
}
function toOutputFileName(relativePathFromSrc) {
  if (relativePathFromSrc.endsWith(".ts")) {
    return relativePathFromSrc.slice(0, -3) + ".js";
  }
  return relativePathFromSrc;
}
async function collectStaticAssets(args) {
  const { root, pagesDir, pageExtensions } = args;
  const srcDir = path6.join(root, pagesDir);
  const entries = await fg("**/*", {
    cwd: srcDir,
    onlyFiles: true,
    dot: false,
    absolute: false
  });
  const assets = [];
  for (const entry of entries) {
    const rel = normalizeSlashes(entry);
    if (shouldIgnoreFile(rel)) continue;
    if (hasAnySuffix(rel, pageExtensions)) continue;
    const absolutePath = path6.join(srcDir, rel);
    assets.push({
      absolutePath,
      relativePathFromSrc: rel,
      outputFileName: normalizeSlashes(toOutputFileName(rel)),
      kind: isProcessableAsset(rel) ? "process" : "copy"
    });
  }
  return assets;
}
async function copyStaticAssetSource(asset) {
  return fs3.readFile(asset.absolutePath);
}
async function buildProcessedStaticAssets(args) {
  const { root, pagesDir, assets, minify = true, sourcemap = false } = args;
  const processable = assets.filter((a) => a.kind === "process");
  const out = /* @__PURE__ */ new Map();
  if (processable.length === 0) {
    return out;
  }
  const srcDir = path6.join(root, pagesDir);
  const distDir = path6.join(root, "dist");
  const warnedMissingAssets = /* @__PURE__ */ new Set();
  const result = await esbuild.build({
    entryPoints: processable.map((a) => a.absolutePath),
    absWorkingDir: root,
    outbase: srcDir,
    outdir: distDir,
    bundle: true,
    splitting: true,
    treeShaking: true,
    minify,
    sourcemap,
    format: "esm",
    target: "es2020",
    platform: "browser",
    write: false,
    entryNames: "[dir]/[name]",
    assetNames: "[dir]/[name]",
    loader: {
      ".css": "css",
      ".png": "file",
      ".jpg": "file",
      ".jpeg": "file",
      ".gif": "file",
      ".svg": "file",
      ".webp": "file",
      ".woff": "file",
      ".woff2": "file",
      ".ttf": "file",
      ".otf": "file"
    },
    plugins: [
      {
        name: "html-pages-root-url-resolver",
        setup(build2) {
          build2.onResolve({ filter: /^\// }, (resolveArgs) => {
            if (path6.isAbsolute(resolveArgs.path) && fsSync.existsSync(resolveArgs.path)) {
              return { path: resolveArgs.path };
            }
            const cleanPath = resolveArgs.path.slice(1);
            const fromSrc = path6.join(srcDir, cleanPath);
            if (fsSync.existsSync(fromSrc)) {
              return { path: fromSrc };
            }
            const fromPublic = path6.join(root, "public", cleanPath);
            if (fsSync.existsSync(fromPublic)) {
              return {
                path: resolveArgs.path,
                external: true
              };
            }
            const isCssUrlToken = resolveArgs.kind === "url-token";
            if (isCssUrlToken) {
              if (!warnedMissingAssets.has(resolveArgs.path)) {
                warnedMissingAssets.add(resolveArgs.path);
                console.warn(
                  `[vite-plugin-html-pages] \u26A0\uFE0F Missing CSS asset: ${resolveArgs.path}
  Looked in:
  - ${fromSrc}
  - ${fromPublic}`
                );
              }
              return {
                path: resolveArgs.path,
                external: true
              };
            }
            return {
              path: fromSrc
            };
          });
        }
      }
    ]
  });
  for (const file of result.outputFiles) {
    const rel = normalizeSlashes(path6.relative(distDir, file.path));
    out.set(rel, file.text ?? file.contents);
  }
  return out;
}

// src/plugin.ts
var hasWarnedESM = false;
var pluginDir = path7.dirname(fileURLToPath(import.meta.url));
function warnIfNotESM(root) {
  try {
    const pkgPath = path7.join(root, "package.json");
    if (!fs4.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs4.readFileSync(pkgPath, "utf8"));
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
function isHtJsxFile(id) {
  return id.endsWith(".ht.jsx") || id.endsWith(".html.jsx") || id.endsWith(".ht.tsx") || id.endsWith(".html.tsx");
}
function isHtTsxFile(id) {
  return id.endsWith(".ht.tsx") || id.endsWith(".html.tsx");
}
function isHtJsxImporter(importer) {
  if (!importer) return false;
  const normalized = importer.split("?")[0].replace(/\\/g, "/");
  return isHtJsxFile(normalized);
}
function htPages(options = {}) {
  let root = process.cwd();
  let server = null;
  let devPages = [];
  let watcherAttached = false;
  const cleanUrls = options.cleanUrls ?? true;
  const pagesDir = options.pagesDir ?? "src";
  const pageExtensions = options.pageExtensions?.length ? options.pageExtensions : [
    ".ht.js",
    ".html.js",
    ".ht.ts",
    ".html.ts",
    ".ht.jsx",
    ".html.jsx",
    ".ht.tsx",
    ".html.tsx"
  ];
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
      root,
      getPages: async () => entries
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
    resolveId(id, importer) {
      if (id === VIRTUAL_BUILD_ENTRY_ID) {
        return id;
      }
      if (id === VIRTUAL_PAGE_HELPER_ID && importer) {
        return `${RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX}${importer}`;
      }
      if (id === VIRTUAL_JSX_RUNTIME_ID) {
        return RESOLVED_VIRTUAL_JSX_RUNTIME_ID;
      }
      if (id === VIRTUAL_JSX_DEV_RUNTIME_ID) {
        return RESOLVED_VIRTUAL_JSX_DEV_RUNTIME_ID;
      }
      if (isHtJsxImporter(importer)) {
        if (id === "react/jsx-runtime") {
          return RESOLVED_VIRTUAL_JSX_RUNTIME_ID;
        }
        if (id === "react/jsx-dev-runtime") {
          return RESOLVED_VIRTUAL_JSX_DEV_RUNTIME_ID;
        }
      }
      return null;
    },
    async load(id) {
      if (id === VIRTUAL_BUILD_ENTRY_ID) {
        return "export default {};";
      }
      if (id === RESOLVED_VIRTUAL_JSX_RUNTIME_ID) {
        return `
export { Fragment, jsx, jsxs, jsxDEV } from ${JSON.stringify(
          pathToFileURL(path7.join(pluginDir, "jsx-runtime.js")).href
        )};
`;
      }
      if (id === RESOLVED_VIRTUAL_JSX_DEV_RUNTIME_ID) {
        return `
export { Fragment, jsx, jsxs, jsxDEV } from ${JSON.stringify(
          pathToFileURL(path7.join(pluginDir, "jsx-dev-runtime.js")).href
        )};
`;
      }
      if (id.startsWith(RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX)) {
        const importer = id.slice(RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX.length);
        const { pages } = await buildPagesPipeline();
        const normalizedImporter = path7.resolve(importer);
        const page = pages.find(
          (candidate) => path7.resolve(candidate.absolutePath) === normalizedImporter
        );
        return generateTypedPageHelper(page);
      }
      return null;
    },
    async transform(code, id) {
      const normalizedId = id.split("?")[0].replace(/\\/g, "/");
      if (!isHtJsxFile(normalizedId)) {
        return null;
      }
      const result = await esbuildTransform(code, {
        loader: isHtTsxFile(normalizedId) ? "tsx" : "jsx",
        format: "esm",
        jsx: "automatic",
        jsxImportSource: "vite-plugin-html-pages",
        sourcemap: true,
        sourcefile: normalizedId,
        target: "es2020"
      });
      return {
        code: result.code,
        map: result.map
      };
    },
    configResolved(resolved) {
      root = options.root ? path7.resolve(resolved.root, options.root) : resolved.root;
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
      const staticAssets = await collectStaticAssets({
        root,
        pagesDir,
        pageExtensions
      });
      for (const asset of staticAssets) {
        this.addWatchFile(asset.absolutePath);
      }
      logDebug(
        options.debug,
        "static assets",
        staticAssets.map((asset) => ({
          kind: asset.kind,
          input: asset.relativePathFromSrc,
          output: asset.outputFileName
        }))
      );
    },
    configureServer(_server) {
      server = _server;
      installDevServer({
        server,
        root,
        pagesDir,
        getPages: async () => {
          if (devPages.length > 0) return devPages;
          return loadDevPages();
        },
        getEntries: async () => discoverEntryPages(root, options)
      });
      if (!watcherAttached) {
        watcherAttached = true;
        const reload = async (file) => {
          if (!file.includes(`${path7.sep}${pagesDir}${path7.sep}`) && !file.includes(`/${pagesDir}/`)) {
            return;
          }
          logDebug(options.debug, "file changed", file);
          await loadDevPages();
          server?.ws.send({
            type: "full-reload",
            path: "*"
          });
        };
        server.watcher.on("add", reload);
        server.watcher.on("change", reload);
        server.watcher.on("unlink", reload);
      }
      loadDevPages().catch((error) => {
        server?.config.logger.error(
          `[${PLUGIN_NAME}] loadDevPages failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
        );
      });
    },
    async generateBundle(_, bundle) {
      try {
        const { modulesByEntry, pages } = await buildPagesPipeline();
        const staticAssets = await collectStaticAssets({
          root,
          pagesDir,
          pageExtensions
        });
        logDebug(
          options.debug,
          "emitting pages",
          pages.map((p) => p.fileName)
        );
        logDebug(
          options.debug,
          "emitting static assets",
          staticAssets.map((asset) => ({
            kind: asset.kind,
            input: asset.relativePathFromSrc,
            output: asset.outputFileName
          }))
        );
        const limit = pLimit(options.renderConcurrency ?? 8);
        const batchSize = options.renderBatchSize ?? Math.max(options.renderConcurrency ?? 8, 32);
        const processedOutputs = await buildProcessedStaticAssets({
          root,
          pagesDir,
          assets: staticAssets,
          minify: true,
          sourcemap: false
        });
        for (const [fileName, source] of processedOutputs) {
          this.emitFile({
            type: "asset",
            fileName,
            source
          });
        }
        for (const asset of staticAssets) {
          if (asset.kind !== "copy") continue;
          const source = await copyStaticAssetSource(asset);
          this.emitFile({
            type: "asset",
            fileName: asset.outputFileName,
            source
          });
        }
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
                validateHtmlAssetReferences({
                  root,
                  pagesDir,
                  html,
                  pluginName: PLUGIN_NAME,
                  pageLabel: page.relativePath,
                  missingAssets: options.missingAssets ?? "error"
                });
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
          validateHtmlAssetReferences({
            root,
            pagesDir,
            html,
            pluginName: PLUGIN_NAME,
            pageLabel: notFoundPage.relativePath,
            missingAssets: options.missingAssets ?? "error"
          });
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
        const rss = options.rss;
        if (rss?.site) {
          const routePrefix = rss.routePrefix ?? "/blog";
          const rssItems = pages.filter((page) => page.routePath.startsWith(routePrefix)).map((page) => {
            const url = `${rss.site}${page.routePath}`;
            return `  <item>
    <title>${page.routePath}</title>
    <link>${url}</link>
    <guid>${url}</guid>
  </item>`;
          }).join("\n");
          const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${rss.title ?? PLUGIN_NAME}</title>
  <link>${rss.site}</link>
  <description>${rss.description ?? "RSS feed"}</description>
${rssItems}
</channel>
</rss>
`;
          this.emitFile({
            type: "asset",
            fileName: "rss.xml",
            source: rssXml
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
import fs5 from "fs/promises";
import path8 from "path";
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
  return path8.join(process.cwd(), CACHE_DIR_NAME, "fetch", `${cacheKey}.json`);
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
    await fs5.mkdir(path8.dirname(filePath), { recursive: true });
    if (!options.forceRefresh) {
      try {
        const raw = await fs5.readFile(filePath, "utf8");
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
    await fs5.writeFile(filePath, JSON.stringify(record), "utf8");
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