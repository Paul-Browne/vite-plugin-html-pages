import {
  __toESM,
  require_native,
  rollup
} from "./chunk-XFMAP2PF.js";

// src/plugin.ts
import path4 from "path";
import { pathToFileURL } from "url";
import { createHash as createHash2 } from "crypto";
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
var DYNAMIC_SEGMENT_RE = /\[([A-Za-z0-9_]+)\]/g;
var CATCH_ALL_SEGMENT_RE = /\[\.\.\.([A-Za-z0-9_]+)\]/g;
var ANY_PARAM_RE = /\[(?:\.\.\.)?([A-Za-z0-9_]+)\]/g;
function getParamNames(relativeFromPagesDir) {
  return [...relativeFromPagesDir.matchAll(ANY_PARAM_RE)].map((m) => m[1]);
}
function isDynamicPage(relativeFromPagesDir) {
  return ANY_PARAM_RE.test(relativeFromPagesDir);
}
function toRoutePattern(relativeFromPagesDir) {
  const noExt = stripHtSuffix(toPosix(relativeFromPagesDir));
  const raw = noExt.replace(/(^|\/)index$/i, "$1").replace(CATCH_ALL_SEGMENT_RE, "*:$1").replace(DYNAMIC_SEGMENT_RE, ":$1");
  return normalizeRoutePath(raw || "/");
}
function fillParams(pattern, params) {
  return pattern.replace(/\*:([A-Za-z0-9_]+)/g, (_, key) => {
    if (!(key in params)) throw new Error(`Missing catch-all route param "${key}"`);
    return String(params[key]).split("/").map((part) => encodeURIComponent(part)).join("/");
  }).replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    if (!(key in params)) throw new Error(`Missing route param "${key}"`);
    return encodeURIComponent(params[key]);
  });
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
  for (let i = 0, j = 0; i < a.length; i++, j++) {
    const seg = a[i];
    if (seg.startsWith("*:")) {
      params[seg.slice(2)] = b.slice(j).map(decodeURIComponent).join("/");
      return params;
    }
    if (j >= b.length) return null;
    if (seg.startsWith(":")) {
      params[seg.slice(1)] = decodeURIComponent(b[j]);
      continue;
    }
    if (seg !== b[j]) return null;
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
    if (aa == null) return -1;
    if (bb == null) return 1;
    const aCatchAll = aa.startsWith("*:");
    const bCatchAll = bb.startsWith("*:");
    if (aCatchAll !== bCatchAll) return aCatchAll ? 1 : -1;
    const aDynamic = aa.startsWith(":");
    const bDynamic = bb.startsWith(":");
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;
  }
  return aSegs.length - bSegs.length;
}

// src/discover.ts
async function discoverEntryPages(root, options) {
  const include = Array.isArray(options.include) ? options.include : [options.include ?? "src/**/*.ht.js"];
  const exclude = Array.isArray(options.exclude) ? options.exclude : options.exclude ? [options.exclude] : [];
  const pagesDir = options.pagesDir ?? "src";
  const files = await fg(include, {
    cwd: root,
    ignore: exclude,
    absolute: true
  });
  return files.sort().map((absolutePath) => {
    const entryPath = normalizeFsPath(absolutePath);
    const relativePath = toPosix(path2.relative(root, entryPath));
    const relativeFromPagesDir = toPosix(path2.relative(path2.join(root, pagesDir), entryPath));
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
    `[vite-plugin-htjs-pages] Page "${page.relativePath}" must resolve to an HTML string, got ${typeof value}`
  );
}
function pageError(page, cause) {
  const message = `[vite-plugin-htjs-pages] Failed to render ${page.relativePath} (${page.routePath})`;
  if (cause instanceof Error && cause.stack) {
    const err = new Error(message);
    err.stack = `${err.stack}
Caused by:
${cause.stack}`;
    return err;
  }
  return new Error(message);
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
function installDevServer(args) {
  const { server, getPages } = args;
  server.middlewares.use(async (req, res, next) => {
    if (!req.url || req.method !== "GET") return next();
    const pathname = req.url.split("?")[0];
    const pages = getPages();
    for (const page of pages) {
      const params = routeMatch(page.routePattern, pathname);
      if (!params) continue;
      const mod = await server.ssrLoadModule(page.entryPath);
      const resolvedPage = { ...page, routePath: pathname || "/", params };
      const html = await renderPage(resolvedPage, mod, true);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }
    next();
  });
}

// src/page-index.ts
async function buildPageIndex(args) {
  const { entries, modulesByEntry, cleanUrls } = args;
  const pages = [];
  for (const entry of entries) {
    const mod = modulesByEntry.get(entry.entryPath) ?? {};
    if (entry.dynamic) {
      const rows = mod.generateStaticParams ? await mod.generateStaticParams() : [];
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
          rows,
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
  return pages;
}

// src/render-bundle.ts
import path3 from "path";
import fs from "fs/promises";
import { createHash } from "crypto";

// node_modules/rollup/dist/es/rollup.js
var import_native = __toESM(require_native(), 1);
import "path";
import "process";
import "perf_hooks";
import "fs/promises";

// src/manifest.ts
function js(value) {
  return JSON.stringify(value);
}
function createManifestModule(entries) {
  const imports = entries.map((page, i) => `import * as page${i} from ${js(page.entryPath)};`).join("");
  const records = entries.map((page, i) => `{
  page: ${js(page)},
  mod: page${i}
}`).join(",");
  return `${imports}

export const manifest = [
${records}
];
`;
}

// src/render-bundle.ts
var VIRTUAL_MANIFEST_ID = "\0virtual:htjs-pages-manifest";
async function buildRenderBundle(args) {
  const { entries, cacheDir, ssrPlugins = [] } = args;
  const source = createManifestModule(entries);
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const bundlePath = path3.join(cacheDir, `render-${hash}.mjs`);
  await fs.mkdir(cacheDir, { recursive: true });
  const bundle = await rollup({
    input: VIRTUAL_MANIFEST_ID,
    plugins: [
      {
        name: "htjs-pages:virtual-manifest",
        resolveId(id) {
          return id === VIRTUAL_MANIFEST_ID ? id : null;
        },
        load(id) {
          return id === VIRTUAL_MANIFEST_ID ? source : null;
        }
      },
      ...ssrPlugins
    ],
    treeshake: true
  });
  const { output } = await bundle.generate({
    format: "esm",
    exports: "named",
    inlineDynamicImports: true
  });
  const chunk = output.find((item) => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk") {
    throw new Error("Failed to generate HT pages render bundle.");
  }
  await fs.writeFile(bundlePath, chunk.code, "utf8");
  await bundle.close();
  return bundlePath;
}

// src/plugin.ts
var VIRTUAL_BUILD_ENTRY_ID = "\0vite-plugin-htjs-pages:build-entry";
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
  async function loadDevPages() {
    const entries = await discoverEntryPages(root, options);
    const modulesByEntry = /* @__PURE__ */ new Map();
    if (!server) return [];
    for (const entry of entries) {
      const mod = await server.ssrLoadModule(entry.entryPath);
      modulesByEntry.set(entry.entryPath, mod);
    }
    devPages = await buildPageIndex({
      entries,
      modulesByEntry,
      cleanUrls
    });
    return devPages;
  }
  return {
    name: "vite-plugin-htjs-pages",
    config(userConfig) {
      const hasExplicitInput = userConfig.build?.rollupOptions?.input != null;
      if (hasExplicitInput) return;
      return {
        appType: "custom",
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
        getPages: () => devPages
      });
      loadDevPages().catch((error) => {
        server?.config.logger.error(String(error));
      });
      return () => {
        server = null;
      };
    },
    async handleHotUpdate() {
      if (server) {
        await loadDevPages();
      }
      return void 0;
    },
    async generateBundle() {
      const entries = await discoverEntryPages(root, options);
      const cacheDir = path4.join(root, "node_modules/.cache/vite-plugin-htjs-pages");
      const bundlePath = await buildRenderBundle({
        entries,
        cacheDir,
        ssrPlugins: options.ssrPlugins
      });
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
      const limit = pLimit(options.renderConcurrency ?? 8);
      const batchSize = options.renderBatchSize ?? Math.max(options.renderConcurrency ?? 8, 32);
      for (const batch of chunkArray(pages, batchSize)) {
        await Promise.all(
          batch.map(
            (page) => limit(async () => {
              const mod = modulesByEntry.get(page.entryPath);
              if (!mod) throw new Error(`Missing module for page entry: ${page.entryPath}`);
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
    }
  };
}
export {
  htPages
};
/*! Bundled license information:

rollup/dist/es/rollup.js:
  (*
    @license
  	Rollup.js v4.59.0
  	Sun, 22 Feb 2026 07:31:53 GMT - commit ae846957f109690a866cc3e4c073613c338d3476
  
  	https://github.com/rollup/rollup
  
  	Released under the MIT License.
  *)
*/
//# sourceMappingURL=index.js.map