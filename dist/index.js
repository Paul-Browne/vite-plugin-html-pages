// src/plugin.ts
import path4 from "path";
import { pathToFileURL } from "url";
import pLimit from "p-limit";

// src/discover.ts
import path2 from "path";
import fg from "fast-glob";

// src/path-utils.ts
import path from "path";
function toPosix(p) {
  return p.split(path.sep).join("/");
}
function stripHtSuffix(file) {
  return file.replace(/\.ht\.js$/i, "");
}
function normalizeRoutePath(p) {
  let out = p.startsWith("/") ? p : `/${p}`;
  out = out.replace(/\/+/g, "/");
  if (out !== "/" && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}
function normalizeFsPath(p) {
  return toPosix(path.resolve(p));
}

// src/route-utils.ts
function safeDecodeURIComponent(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}
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
function toRoutePattern(relativeFromPagesDir) {
  const noExt = stripHtSuffix(toPosix(relativeFromPagesDir));
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
      params[patternSeg.slice(3)] = i < b.length ? b.slice(i).map(safeDecodeURIComponent).join("/") : "";
      return params;
    }
    if (patternSeg.startsWith("*:")) {
      const rest = b.slice(i);
      if (rest.length === 0) return null;
      params[patternSeg.slice(2)] = rest.map(safeDecodeURIComponent).join("/");
      return params;
    }
    if (!urlSeg) return null;
    if (patternSeg.startsWith(":")) {
      params[patternSeg.slice(1)] = safeDecodeURIComponent(urlSeg);
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
var PLUGIN_NAME = "vite-plugin-htjs-pages";
var VIRTUAL_BUILD_ENTRY_ID = `\0${PLUGIN_NAME}:build-entry`;
var VIRTUAL_MANIFEST_ID = `\0virtual:${PLUGIN_NAME}-manifest`;
var CACHE_DIR_NAME = `node_modules/.cache/${PLUGIN_NAME}`;

// src/discover.ts
async function discoverEntryPages(root, options) {
  const rawInclude = Array.isArray(options.include) ? options.include : [options.include ?? "src/**/*.ht.js"];
  let include = rawInclude.filter((p) => typeof p === "string" && p.length > 0);
  if (include.length === 0) {
    include = ["src/**/*.ht.js"];
  }
  const exclude = Array.isArray(options.exclude) ? options.exclude : options.exclude ? [options.exclude] : [];
  const pagesDir = options.pagesDir ?? "src";
  const pagesRoot = normalizeFsPath(path2.join(root, pagesDir));
  const files = await fg(include, {
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
    const routePattern = toRoutePattern(relativeFromPagesDir);
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

// src/render-bundle.ts
import path3 from "path";
import fs from "fs/promises";
import { createHash } from "crypto";
import { rollup } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";

// src/manifest.ts
function js(value) {
  return JSON.stringify(value);
}
function createManifestModule(entries) {
  const imports = entries.map((page, i) => `import * as page${i} from ${js(page.entryPath)};`).join("\n");
  const records = entries.map(
    (page, i) => `{
  page: ${js(page)},
  mod: page${i}
}`
  ).join(",\n");
  return `${imports}

export const manifest = [
${records}
];
`;
}

// src/render-bundle.ts
async function createRenderBundleHash(entries, manifestSource) {
  const hash = createHash("sha256");
  hash.update(manifestSource);
  for (const entry of entries) {
    hash.update(entry.entryPath);
    const source = await fs.readFile(entry.entryPath, "utf8");
    hash.update(source);
  }
  return hash.digest("hex").slice(0, 12);
}
async function buildRenderBundle(args) {
  const { entries, cacheDir, ssrPlugins = [] } = args;
  const manifestSource = createManifestModule(entries);
  const hash = await createRenderBundleHash(entries, manifestSource);
  const bundlePath = path3.join(cacheDir, `render-${hash}.mjs`);
  await fs.mkdir(cacheDir, { recursive: true });
  try {
    await fs.access(bundlePath);
    return bundlePath;
  } catch {
  }
  const bundle = await rollup({
    input: VIRTUAL_MANIFEST_ID,
    plugins: [
      {
        name: `${PLUGIN_NAME}:virtual-manifest`,
        resolveId(id) {
          return id === VIRTUAL_MANIFEST_ID ? id : null;
        },
        load(id) {
          return id === VIRTUAL_MANIFEST_ID ? manifestSource : null;
        }
      },
      nodeResolve({
        preferBuiltins: true,
        exportConditions: ["node"]
      }),
      ...ssrPlugins
    ],
    treeshake: true
  });
  try {
    const { output } = await bundle.generate({
      format: "esm",
      exports: "named",
      inlineDynamicImports: true
    });
    const chunk = output.find((item) => item.type === "chunk");
    if (!chunk || chunk.type !== "chunk") {
      throw new Error(
        `[${PLUGIN_NAME}] Failed to generate HT pages render bundle.`
      );
    }
    await fs.writeFile(bundlePath, chunk.code, "utf8");
    return bundlePath;
  } finally {
    await bundle.close();
  }
}

// src/plugin.ts
function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
async function importManifest(bundlePath) {
  const mod = await import(pathToFileURL(bundlePath).href + `?t=${Date.now()}`);
  return mod.manifest;
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
    for (const entry of entries) {
      const mod = await server.ssrLoadModule(
        `/${entry.relativePath}`
      );
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
    const cacheDir = path4.join(root, CACHE_DIR_NAME);
    const bundlePath = await buildRenderBundle({
      entries,
      cacheDir,
      ssrPlugins: options.ssrPlugins
    });
    logDebug(options.debug, "render bundle", bundlePath);
    const manifest = await importManifest(bundlePath);
    const modulesByEntry = /* @__PURE__ */ new Map();
    for (const rec of manifest) {
      modulesByEntry.set(rec.page.entryPath, rec.mod);
    }
    const pages = await buildPageIndex({
      entries,
      modulesByEntry,
      cleanUrls
    });
    return { entries, bundlePath, modulesByEntry, pages };
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
      if (!ctx.file.endsWith(".ht.js")) {
        return;
      }
      logDebug(options.debug, "page updated", ctx.file);
      await loadDevPages();
      return void 0;
    },
    async generateBundle(_, bundle) {
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
      }
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk" && output.facadeModuleId === VIRTUAL_BUILD_ENTRY_ID) {
          delete bundle[fileName];
        }
      }
    }
  };
}
export {
  htPages
};
//# sourceMappingURL=index.js.map