// src/plugin.ts
import fs6 from "fs";
import path9 from "path";
import { fileURLToPath as fileURLToPath3, pathToFileURL } from "url";
import { transform as esbuildTransform } from "esbuild";

// src/typegen.ts
import fs from "fs/promises";
import path2 from "path";

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

// src/typegen.ts
function pageHelperModuleSource(page) {
  const paramsType = paramsTypeFromDefinitions(page.paramDefinitions ?? []);
  return `export type PageParams = ${paramsType};

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

export type RenderResult = unknown;

export type PageModule<TData = unknown> = {
  generateStaticParams?: () => StaticParams | Promise<StaticParams>;
  data?: (ctx: DataContext) => TData | Promise<TData>;
  render: (ctx: RenderContext<TData>) => RenderResult | Promise<RenderResult>;
};

export declare function definePage<
  T extends (ctx: PageContext) => RenderResult | Promise<RenderResult>
>(fn: T): T;

export declare function defineData<
  T extends (ctx: DataContext) => unknown | Promise<unknown>
>(fn: T): T;

export declare function defineStaticParams<
  T extends () => StaticParams | Promise<StaticParams>
>(fn: T): T;

export declare function definePageModule<TData>(
  mod: PageModule<TData>
): PageModule<TData>;
`;
}
function stripPageExtension(filePath) {
  return filePath.replace(/\.(ht|html)\.(js|ts|jsx|tsx)$/i, "");
}
function getTypesFileName(page) {
  if (!page.dynamic || page.paramDefinitions.length === 0) {
    return "$types.d.ts";
  }
  const parts = page.paramDefinitions.map((param) => {
    if (param.type === "single") {
      return param.name;
    }
    if (param.type === "catch-all") {
      return `${param.name}.all`;
    }
    return `${param.name}.opt`;
  });
  return `$types.${parts.join(".")}.d.ts`;
}
async function listFilesRecursive(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    const err = error;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path2.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(fullPath);
      }
      return [fullPath];
    })
  );
  return files.flat();
}
async function removeEmptyDirectories(dir, stopAt) {
  const normalizedDir = normalizeFsPath(dir);
  const normalizedStopAt = normalizeFsPath(stopAt);
  if (normalizedDir === normalizedStopAt) {
    return;
  }
  let entries;
  try {
    entries = await fs.readdir(normalizedDir);
  } catch (error) {
    const err = error;
    if (err.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (entries.length > 0) {
    return;
  }
  await fs.rmdir(normalizedDir);
  await removeEmptyDirectories(path2.dirname(normalizedDir), normalizedStopAt);
}
function getGeneratedTypesRoot(root, generatedTypesDir = ".vite-plugin-html-pages/types") {
  return normalizeFsPath(path2.join(root, generatedTypesDir));
}
function getGeneratedHelperPath(args) {
  const pagesRoot = normalizeFsPath(path2.join(args.root, args.pagesDir));
  const relativeFromPagesDir = toPosix(
    path2.relative(pagesRoot, args.page.absolutePath)
  );
  const withoutExt = stripPageExtension(relativeFromPagesDir);
  const outRoot = getGeneratedTypesRoot(args.root, args.generatedTypesDir);
  const fileName = getTypesFileName(args.page);
  return normalizeFsPath(
    path2.join(outRoot, path2.dirname(withoutExt), fileName)
  );
}
async function removeStalePageTypeDeclarations(args) {
  const outRoot = getGeneratedTypesRoot(args.root, args.generatedTypesDir);
  const existingFiles = await listFilesRecursive(outRoot);
  const staleFiles = existingFiles.filter((file) => {
    if (!file.endsWith(".d.ts")) {
      return false;
    }
    return !args.expectedFiles.has(normalizeFsPath(file));
  });
  await Promise.all(
    staleFiles.map(async (file) => {
      await fs.unlink(file);
      await removeEmptyDirectories(path2.dirname(file), outRoot);
    })
  );
}
async function writePageTypeDeclarations(args) {
  const outRoot = getGeneratedTypesRoot(args.root, args.generatedTypesDir);
  await fs.mkdir(outRoot, { recursive: true });
  const outputs = args.entries.map((page) => ({
    page,
    outFile: getGeneratedHelperPath({
      root: args.root,
      pagesDir: args.pagesDir,
      page,
      generatedTypesDir: args.generatedTypesDir
    })
  }));
  const expectedFiles = new Set(
    outputs.map(({ outFile }) => normalizeFsPath(outFile))
  );
  await Promise.all(
    outputs.map(async ({ page, outFile }) => {
      await fs.mkdir(path2.dirname(outFile), { recursive: true });
      await fs.writeFile(outFile, pageHelperModuleSource(page), "utf8");
    })
  );
  await removeStalePageTypeDeclarations({
    root: args.root,
    expectedFiles,
    generatedTypesDir: args.generatedTypesDir
  });
}

// src/format-dev-error.ts
import fs2 from "fs";
import path3 from "path";
import { fileURLToPath } from "url";

// src/picocolors.ts
var { argv, env, platform, stdout } = process;
var forceColor = env.FORCE_COLOR;
var isColorSupported = !(env.NO_COLOR || argv.includes("--no-color") || forceColor === "0" || forceColor === "false") && (!!forceColor || argv.includes("--color") || platform === "win32" || !!stdout?.isTTY && env.TERM !== "dumb" || !!env.CI);
var formatter = (open, close, replace = open) => (input) => open + String(input).split(close).join(replace) + close;
function createColors(enabled = isColorSupported) {
  const f = enabled ? formatter : () => String;
  return {
    isColorSupported: enabled,
    reset: f("\x1B[0m", "\x1B[0m"),
    bold: f("\x1B[1m", "\x1B[22m", "\x1B[22m\x1B[1m"),
    dim: f("\x1B[2m", "\x1B[22m", "\x1B[22m\x1B[2m"),
    italic: f("\x1B[3m", "\x1B[23m"),
    underline: f("\x1B[4m", "\x1B[24m"),
    inverse: f("\x1B[7m", "\x1B[27m"),
    hidden: f("\x1B[8m", "\x1B[28m"),
    strikethrough: f("\x1B[9m", "\x1B[29m"),
    black: f("\x1B[30m", "\x1B[39m"),
    red: f("\x1B[31m", "\x1B[39m"),
    green: f("\x1B[32m", "\x1B[39m"),
    yellow: f("\x1B[33m", "\x1B[39m"),
    blue: f("\x1B[34m", "\x1B[39m"),
    magenta: f("\x1B[35m", "\x1B[39m"),
    cyan: f("\x1B[36m", "\x1B[39m"),
    white: f("\x1B[37m", "\x1B[39m"),
    gray: f("\x1B[90m", "\x1B[39m"),
    bgBlack: f("\x1B[40m", "\x1B[49m"),
    bgRed: f("\x1B[41m", "\x1B[49m"),
    bgGreen: f("\x1B[42m", "\x1B[49m"),
    bgYellow: f("\x1B[43m", "\x1B[49m"),
    bgBlue: f("\x1B[44m", "\x1B[49m"),
    bgMagenta: f("\x1B[45m", "\x1B[49m"),
    bgCyan: f("\x1B[46m", "\x1B[49m"),
    bgWhite: f("\x1B[47m", "\x1B[49m"),
    blackBright: f("\x1B[90m", "\x1B[39m"),
    redBright: f("\x1B[91m", "\x1B[39m"),
    greenBright: f("\x1B[92m", "\x1B[39m"),
    yellowBright: f("\x1B[93m", "\x1B[39m"),
    blueBright: f("\x1B[94m", "\x1B[39m"),
    magentaBright: f("\x1B[95m", "\x1B[39m"),
    cyanBright: f("\x1B[96m", "\x1B[39m"),
    whiteBright: f("\x1B[97m", "\x1B[39m"),
    bgBlackBright: f("\x1B[100m", "\x1B[49m"),
    bgRedBright: f("\x1B[101m", "\x1B[49m"),
    bgGreenBright: f("\x1B[102m", "\x1B[49m"),
    bgYellowBright: f("\x1B[103m", "\x1B[49m"),
    bgBlueBright: f("\x1B[104m", "\x1B[49m"),
    bgMagentaBright: f("\x1B[105m", "\x1B[49m"),
    bgCyanBright: f("\x1B[106m", "\x1B[49m"),
    bgWhiteBright: f("\x1B[107m", "\x1B[49m")
  };
}
var picocolors_default = createColors();

// src/format-dev-error.ts
function extractSourceLocation(error, root) {
  const stack = error.stack ?? "";
  for (const stackLine of stack.split("\n")) {
    const match = stackLine.match(
      /(?:\()?((?:file:\/\/\/)?[^()\n]+?):(\d+):(\d+)\)?\s*$/
    );
    if (!match) continue;
    let file = match[1].trim();
    file = file.replace(/^at\s+(?:.+?\s+\()?/, "");
    file = file.split("?")[0].split("#")[0];
    try {
      if (file.startsWith("file://")) {
        file = fileURLToPath(file);
      } else {
        file = decodeURIComponent(file);
      }
    } catch {
      continue;
    }
    if (!path3.isAbsolute(file)) continue;
    if (file.includes(`${path3.sep}node_modules${path3.sep}`)) continue;
    const relativeFile = path3.relative(root, file);
    if (relativeFile === ".." || relativeFile.startsWith(`..${path3.sep}`)) {
      continue;
    }
    if (!fs2.existsSync(file)) continue;
    return {
      file,
      line: Number(match[2]),
      column: Number(match[3])
    };
  }
  return null;
}
function refineReferenceErrorLocation(error, location) {
  const match = error.message.match(
    /^([A-Za-z_$][A-Za-z0-9_$]*) is not defined$/
  );
  if (!match || !fs2.existsSync(location.file)) {
    return location;
  }
  const identifier = match[1];
  const lines = fs2.readFileSync(location.file, "utf8").split(/\r?\n/);
  const reportedIndex = location.line - 1;
  const start = Math.max(0, reportedIndex - 2);
  const end = Math.min(lines.length - 1, reportedIndex + 3);
  const identifierPattern = new RegExp(
    `\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
  );
  let bestMatch;
  for (let index = start; index <= end; index++) {
    const column = lines[index].search(identifierPattern);
    if (column === -1) continue;
    const distance = Math.abs(index - reportedIndex);
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = {
        line: index + 1,
        column: column + 1,
        distance
      };
    }
  }
  if (!bestMatch) {
    return location;
  }
  return {
    ...location,
    line: bestMatch.line,
    column: bestMatch.column
  };
}
function createSourceFrame(location, contextLines = 3) {
  if (!fs2.existsSync(location.file)) return null;
  const lines = fs2.readFileSync(location.file, "utf8").split(/\r?\n/);
  const errorIndex = location.line - 1;
  const start = Math.max(0, errorIndex - contextLines);
  const end = Math.min(lines.length - 1, errorIndex + contextLines);
  const lineNumberWidth = String(end + 1).length;
  const output = [];
  for (let index = start; index <= end; index++) {
    const number = String(index + 1).padStart(lineNumberWidth, " ");
    const isErrorLine = index === errorIndex;
    const marker = isErrorLine ? picocolors_default.red(">") : " ";
    const line = lines[index];
    output.push(
      `${marker} ${picocolors_default.dim(number)} ${picocolors_default.dim("\u2502")} ${line}`
    );
    if (isErrorLine) {
      const indentation = " ".repeat(Math.max(0, location.column - 1));
      output.push(
        `  ${" ".repeat(lineNumberWidth)} ${picocolors_default.dim("\u2502")} ${indentation}${picocolors_default.red("^")}`
      );
    }
  }
  return output.join("\n");
}
function formatDevPageError(args) {
  const { root, phase, debug = false } = args;
  const error = args.error instanceof Error ? args.error : new Error(String(args.error));
  const extractedLocation = extractSourceLocation(error, root);
  const location = extractedLocation ? refineReferenceErrorLocation(error, extractedLocation) : null;
  const sourceFrame = location ? createSourceFrame(location) : null;
  const heading = phase === "load" ? "PAGE LOAD ERROR" : "PAGE RELOAD ERROR";
  const fileLabel = location ? ` ${path3.relative(root, location.file)}:${location.line}:${location.column}` : "";
  const separatorLength = Math.max(
    12,
    64 - heading.length - fileLabel.length
  );
  const output = [
    "",
    picocolors_default.cyan(
      `\u2500\u2500 ${heading} ${"\u2500".repeat(separatorLength)}${fileLabel}`
    ),
    "",
    `${picocolors_default.red(error.name + ":")} ${error.message}`
  ];
  if (location && sourceFrame) {
    output.push("", path3.relative(root, location.file), "", sourceFrame);
  }
  if (debug && error.stack) {
    output.push("", picocolors_default.dim(error.stack));
  }
  output.push(
    "",
    picocolors_default.yellow("Fix the error and save again."),
    picocolors_default.dim("Watching for file changes..."),
    ""
  );
  return output.join("\n");
}

// src/p-limit.ts
var Node = class {
  constructor(value) {
    this.value = value;
  }
};
var Queue = class {
  #head;
  #tail;
  #size = 0;
  constructor() {
    this.clear();
  }
  enqueue(value) {
    const node = new Node(value);
    if (this.#head) {
      this.#tail.next = node;
      this.#tail = node;
    } else {
      this.#head = node;
      this.#tail = node;
    }
    this.#size++;
  }
  dequeue() {
    const current = this.#head;
    if (!current) {
      return;
    }
    this.#head = current.next;
    this.#size--;
    if (!this.#head) {
      this.#tail = void 0;
    }
    return current.value;
  }
  peek() {
    return this.#head?.value;
  }
  clear() {
    this.#head = void 0;
    this.#tail = void 0;
    this.#size = 0;
  }
  get size() {
    return this.#size;
  }
  *[Symbol.iterator]() {
    let current = this.#head;
    while (current) {
      yield current.value;
      current = current.next;
    }
  }
  *drain() {
    while (this.#head) {
      yield this.dequeue();
    }
  }
};
function pLimit(options) {
  let concurrency;
  let rejectOnClear = false;
  if (typeof options === "object") {
    ({ concurrency, rejectOnClear = false } = options);
  } else {
    concurrency = options;
  }
  validateConcurrency(concurrency);
  if (typeof rejectOnClear !== "boolean") {
    throw new TypeError("Expected `rejectOnClear` to be a boolean");
  }
  const queue = new Queue();
  let activeCount = 0;
  const resumeNext = () => {
    if (activeCount < concurrency && queue.size > 0) {
      activeCount++;
      queue.dequeue().run();
    }
  };
  const next = () => {
    activeCount--;
    resumeNext();
  };
  const run = async (function_, resolve, arguments_) => {
    const result = (async () => function_(...arguments_))();
    resolve(result);
    try {
      await result;
    } catch {
    }
    next();
  };
  const enqueue = (function_, resolve, reject, arguments_) => {
    new Promise((internalResolve) => {
      queue.enqueue({ run: () => internalResolve(), reject });
    }).then(() => run(function_, resolve, arguments_));
    if (activeCount < concurrency) {
      resumeNext();
    }
  };
  const generator = (function_, ...arguments_) => new Promise((resolve, reject) => {
    enqueue(function_, resolve, reject, arguments_);
  });
  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount
    },
    pendingCount: {
      get: () => queue.size
    },
    clearQueue: {
      value() {
        if (!rejectOnClear) {
          queue.clear();
          return;
        }
        const abortError = AbortSignal.abort().reason;
        while (queue.size > 0) {
          queue.dequeue().reject(abortError);
        }
      }
    },
    concurrency: {
      get: () => concurrency,
      set(newConcurrency) {
        validateConcurrency(newConcurrency);
        concurrency = newConcurrency;
        queueMicrotask(() => {
          while (activeCount < concurrency && queue.size > 0) {
            resumeNext();
          }
        });
      }
    },
    map: {
      async value(iterable, function_) {
        const promises = [];
        try {
          Array.from(iterable, (value, index) => {
            const promise = generator(function_, value, index);
            promises.push(promise);
            return promise;
          });
        } catch (error) {
          for (const promise of promises) {
            promise.catch(() => {
            });
          }
          throw error;
        }
        return Promise.all(promises);
      }
    }
  });
  return generator;
}
function validateConcurrency(concurrency) {
  if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }
}

// src/constants.ts
var PLUGIN_NAME = "vite-plugin-html-pages";
var VIRTUAL_BUILD_ENTRY_ID = `\0${PLUGIN_NAME}:build-entry`;
var VIRTUAL_PAGE_HELPER_ID = `${PLUGIN_NAME}/page`;
var RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX = `\0${PLUGIN_NAME}/page:`;
var CACHE_DIR_NAME = `node_modules/.cache/${PLUGIN_NAME}`;
var DEFAULT_PAGE_EXTENSIONS = [
  ".ht.js",
  ".html.js",
  ".ht.ts",
  ".html.ts",
  ".ht.jsx",
  ".html.jsx",
  ".ht.tsx",
  ".html.tsx"
];
var VIRTUAL_JSX_RUNTIME_ID = `${PLUGIN_NAME}/jsx-runtime`;
var VIRTUAL_JSX_DEV_RUNTIME_ID = `${PLUGIN_NAME}/jsx-dev-runtime`;
var RESOLVED_VIRTUAL_JSX_RUNTIME_ID = `\0${VIRTUAL_JSX_RUNTIME_ID}`;
var RESOLVED_VIRTUAL_JSX_DEV_RUNTIME_ID = `\0${VIRTUAL_JSX_DEV_RUNTIME_ID}`;
var VIRTUAL_LOCAL_TYPES_PREFIX = `\0${PLUGIN_NAME}:local-types:`;

// src/base-url.ts
var ALLOWED_META_NAME = [
  "msapplication-tileimage",
  "msapplication-square70x70logo",
  "msapplication-square150x150logo",
  "msapplication-wide310x150logo",
  "msapplication-square310x310logo",
  "msapplication-config",
  "twitter:image"
];
var ALLOWED_META_PROPERTY = [
  "og:image",
  "og:image:url",
  "og:image:secure_url",
  "og:audio",
  "og:audio:secure_url",
  "og:video",
  "og:video:secure_url"
];
var DEFAULT_HTML_ASSET_SOURCES = {
  audio: { srcAttributes: ["src"] },
  embed: { srcAttributes: ["src"] },
  img: { srcAttributes: ["src"], srcsetAttributes: ["srcset"] },
  image: { srcAttributes: ["href", "xlink:href"] },
  input: { srcAttributes: ["src"] },
  link: { srcAttributes: ["href"], srcsetAttributes: ["imagesrcset"] },
  object: { srcAttributes: ["data"] },
  script: { srcAttributes: ["src"] },
  source: { srcAttributes: ["src"], srcsetAttributes: ["srcset"] },
  track: { srcAttributes: ["src"] },
  use: { srcAttributes: ["href", "xlink:href"] },
  video: { srcAttributes: ["src", "poster"] },
  meta: {
    srcAttributes: ["content"],
    filter({ attributes }) {
      const name = attributes.name?.trim().toLowerCase();
      const property = attributes.property?.trim().toLowerCase();
      return !!name && ALLOWED_META_NAME.includes(name) || !!property && ALLOWED_META_PROPERTY.includes(property);
    }
  }
};
var ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
var MARKUP_RE = new RegExp(
  `<!--[\\s\\S]*?(?:-->|$)|<(script|style|textarea|title|xmp|iframe|noembed|noframes)(?=[\\s/>])(${ATTRS})>([\\s\\S]*?)(<\\/\\1\\s*>|$)|<([a-zA-Z][^\\s/>]*)(${ATTRS})>`,
  "gi"
);
var ATTR_RE = /(\s*)([^\s"'<>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
var INLINE_IMPORT_RE = /((?<!(?<!\.\.)\.)\bimport\s*\(\s*)(["'])([^"'`]*)\2(?=\s*\))/g;
function isRootRelative(url) {
  return url[0] === "/" && url[1] !== "/";
}
function isRelativeBase(base) {
  return base === "" || base.startsWith(".");
}
function pageBase(base, fileName) {
  if (isRelativeBase(base)) {
    const depth = fileName.replace(/\\/g, "/").replace(/^\/+/, "").split("/").length - 1;
    return depth === 0 ? "./" : "../".repeat(depth);
  }
  return base.endsWith("/") ? base : `${base}/`;
}
function joinBase(url, base) {
  return isRootRelative(url) ? base + url.slice(1) : url;
}
function joinBaseToSrcset(srcset, base) {
  let out = "";
  let i = 0;
  while (i < srcset.length) {
    const gap = /^[\s,]*/.exec(srcset.slice(i))[0];
    out += gap;
    i += gap.length;
    if (i >= srcset.length) break;
    const token = /^\S+/.exec(srcset.slice(i))[0];
    const url = token.replace(/,+$/, "");
    out += joinBase(url, base) + token.slice(url.length);
    i += token.length;
    if (url !== token) continue;
    let depth = 0;
    const start = i;
    for (; i < srcset.length; i++) {
      const char = srcset[i];
      if (char === "(") depth++;
      else if (char === ")") depth = Math.max(0, depth - 1);
      else if (char === "," && depth === 0) break;
    }
    out += srcset.slice(start, i);
  }
  return out;
}
function parseAttributes(attrs) {
  const out = {};
  for (const match of attrs.matchAll(ATTR_RE)) {
    const key = match[2].toLowerCase();
    if (!(key in out)) out[key] = match[4] ?? match[5] ?? match[6] ?? "";
  }
  return out;
}
function rewriteAttributes(tagName, attrs, base, additionalAssetSources) {
  const name = tagName.toLowerCase();
  const sources = [
    DEFAULT_HTML_ASSET_SOURCES[name],
    additionalAssetSources?.[name]
  ].filter((source) => !!source);
  if (sources.length === 0) return attrs;
  const attributes = parseAttributes(attrs);
  if ("vite-ignore" in attributes) {
    return attrs.replace(
      ATTR_RE,
      (whole, _lead, key) => key.toLowerCase() === "vite-ignore" ? "" : whole
    );
  }
  const srcKeys = /* @__PURE__ */ new Set();
  const srcsetKeys = /* @__PURE__ */ new Set();
  for (const source of sources) {
    const wanted = (key) => {
      const value = attributes[key];
      return !!value && (!source.filter || source.filter({ key, value, attributes }));
    };
    source.srcAttributes?.filter(wanted).forEach((key) => srcKeys.add(key));
    source.srcsetAttributes?.filter(wanted).forEach((key) => srcsetKeys.add(key));
  }
  if (srcKeys.size === 0 && srcsetKeys.size === 0) return attrs;
  return attrs.replace(
    ATTR_RE,
    (whole, lead, key, equals, doubleQuoted, singleQuoted, unquoted) => {
      const value = doubleQuoted ?? singleQuoted ?? unquoted;
      const lowerKey = key.toLowerCase();
      if (value === void 0) return whole;
      const rewritten = srcKeys.has(lowerKey) ? joinBase(value, base) : srcsetKeys.has(lowerKey) ? joinBaseToSrcset(value, base) : value;
      if (rewritten === value) return whole;
      const quote = doubleQuoted !== void 0 ? '"' : singleQuoted !== void 0 ? "'" : "";
      return `${lead}${key}${equals}${quote}${rewritten}${quote}`;
    }
  );
}
function applyBaseToHtml(html, base, additionalAssetSources) {
  if (base === "/") return html;
  return html.replace(
    MARKUP_RE,
    (whole, textTag, textAttrs, text, textClose, tag, attrs) => {
      if (tag) {
        return `<${tag}${rewriteAttributes(tag, attrs, base, additionalAssetSources)}>`;
      }
      if (!textTag) return whole;
      const isInlineScript = textTag.toLowerCase() === "script" && !("src" in parseAttributes(textAttrs));
      const content = isInlineScript ? text.replace(
        INLINE_IMPORT_RE,
        (_, open, quote, url) => `${open}${quote}${joinBase(url, base)}${quote}`
      ) : text;
      return `<${textTag}${rewriteAttributes(textTag, textAttrs, base, additionalAssetSources)}>${content}${textClose}`;
    }
  );
}

// src/discover.ts
import path4 from "path";
import { glob } from "tinyglobby";

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
function routeMatch(pattern, urlPath) {
  const a = normalizeRoutePath(pattern).split("/").filter(Boolean);
  const b = normalizeRoutePath(urlPath).split("/").filter(Boolean);
  const params = {};
  for (let i = 0; i < a.length; i++) {
    const patternSeg = a[i];
    const urlSeg = b[i];
    if (patternSeg.startsWith("*?:")) {
      const key = patternSeg.slice(3);
      if (i < b.length) {
        params[key] = b.slice(i).map(decodeURIComponent);
      }
      return params;
    }
    if (patternSeg.startsWith("*:")) {
      const rest = b.slice(i);
      if (rest.length === 0) return null;
      params[patternSeg.slice(2)] = rest.map(decodeURIComponent);
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
function matchDynamicPage(entries, urlPath) {
  const candidates = entries.filter((entry) => entry.dynamic).sort((a, b) => compareRoutePriority(a.routePattern, b.routePattern));
  const normalizedUrl = normalizeRoutePath(urlPath);
  for (const entry of candidates) {
    const params = routeMatch(entry.routePattern, normalizedUrl);
    if (params) {
      return {
        ...entry,
        routePath: normalizedUrl,
        params
      };
    }
  }
  return null;
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

// src/brand.ts
var currentDisplayName = PLUGIN_NAME;
function setDisplayName(name) {
  currentDisplayName = name?.trim() || PLUGIN_NAME;
}
function getDisplayName() {
  return currentDisplayName;
}
function brand(message) {
  return `[${currentDisplayName}] ${message}`;
}

// src/discover.ts
function buildDefaultIncludeGlobs(pagesDir, pageExtensions) {
  return pageExtensions.map((ext) => {
    const cleanExt = ext.startsWith(".") ? ext.slice(1) : ext;
    return `${pagesDir}/**/*.${cleanExt}`;
  });
}
async function discoverEntryPages(root, options) {
  const pagesDir = options.pagesDir ?? "src";
  const pageExtensions = options.pageExtensions?.length ? options.pageExtensions : DEFAULT_PAGE_EXTENSIONS;
  const include = Array.isArray(options.include) ? options.include : options.include ? [options.include] : buildDefaultIncludeGlobs(pagesDir, pageExtensions);
  const exclude = Array.isArray(options.exclude) ? options.exclude : options.exclude ? [options.exclude] : [];
  const pagesRoot = normalizeFsPath(path4.join(root, pagesDir));
  const files = await glob(include, {
    cwd: root,
    ignore: exclude,
    absolute: true,
    // On by default in tinyglobby, which would turn an `include` or
    // `exclude` naming a directory into "everything inside it".
    expandDirectories: false
  });
  return files.sort().map((absolutePath) => {
    const entryPath = normalizeFsPath(absolutePath);
    const relativePath = toPosix(path4.relative(root, entryPath));
    const relativeFromPagesDir = toPosix(path4.relative(pagesRoot, entryPath));
    if (relativeFromPagesDir.startsWith("../") || relativeFromPagesDir === "..") {
      throw new Error(
        brand(`Page is outside pagesDir: ${entryPath} (pagesDir: ${pagesDir})`)
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
import fs3 from "fs";
import path6 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/errors.ts
function invalidHtmlReturn(page, value) {
  const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  return new Error(
    brand(
      `${page.relativePath}: page render must return a string or a JSX/React renderable value, but received ${type}.`
    )
  );
}
function missingDefaultExport(page) {
  return new Error(
    brand(`Page "${page.relativePath}" does not export a default renderer`)
  );
}
function pageError(page, cause) {
  const message = brand(
    `Failed to render "${page.relativePath}" at route "${page.routePath}"`
  );
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

// src/react-static-validation.ts
var warnedKeys = /* @__PURE__ */ new Set();
function warnOnce(key, message, onWarn) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  onWarn(message);
}
function isEventProp(name) {
  return /^on[A-Z]/.test(name);
}
function getElementName(type) {
  if (typeof type === "string") {
    return `<${type}>`;
  }
  if (typeof type === "function") {
    const maybeNamed = type;
    return maybeNamed.displayName || maybeNamed.name || "AnonymousComponent";
  }
  return "UnknownElement";
}
async function validateStaticJsxTree(node, ctx) {
  const react = await import("react");
  const { isValidElement } = react;
  function inspectElement(el) {
    const props = el.props ?? {};
    for (const [key, value] of Object.entries(props)) {
      if (!isEventProp(key)) continue;
      if (typeof value !== "function") continue;
      const elementName = getElementName(el.type);
      warnOnce(
        `${ctx.page.routePath}:${elementName}:${key}`,
        brand(
          `${ctx.page.relativePath ?? ctx.page.routePath}: prop "${key}" on ${elementName} will not be interactive in static TSX/JSX output. Use a client script or future hydration/islands support instead.`
        ),
        ctx.onWarn
      );
    }
  }
  function walk(value) {
    if (value == null || typeof value === "boolean") return;
    if (typeof value === "string" || typeof value === "number") return;
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child);
      }
      return;
    }
    if (!isValidElement(value)) return;
    inspectElement(value);
    walk(value.props?.children);
  }
  walk(node);
}

// src/render-runtime.ts
function isStructuredPageModule(value) {
  return typeof value === "object" && value !== null && "render" in value && typeof value.render === "function";
}
function ensureDoctype(html) {
  const trimmed = html.trimStart();
  if (/^<!doctype html>/i.test(trimmed)) {
    return html;
  }
  if (/^<html[\s>]/i.test(trimmed)) {
    return "<!DOCTYPE html>" + html;
  }
  return html;
}
async function isRenderableReactResult(value) {
  try {
    const react = await import("react");
    return value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value) || react.isValidElement(value);
  } catch {
    return false;
  }
}
async function renderReactResult(value) {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(value);
}
async function resolveRenderResult(page, mod, ctx) {
  const entry = mod.default;
  if (entry == null) {
    throw missingDefaultExport(page);
  }
  if (typeof entry === "string") {
    return entry;
  }
  if (typeof entry === "function") {
    return await entry(ctx);
  }
  if (isStructuredPageModule(entry)) {
    if (typeof entry.data === "function") {
      ctx.data = await entry.data(ctx);
    }
    return await entry.render(ctx);
  }
  throw invalidHtmlReturn(page, entry);
}
async function ensureReactAvailable(page) {
  try {
    await import("react");
    await import("react-dom/server");
  } catch {
    throw new Error(
      brand(
        `${page.relativePath}: TSX/JSX page rendering requires "react" and "react-dom" to be installed in the consuming app.`
      )
    );
  }
}
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
    const result = await resolveRenderResult(page, mod, ctx);
    if (result == null) {
      throw invalidHtmlReturn(page, result);
    }
    if (typeof result === "string") {
      return ensureDoctype(result);
    }
    await ensureReactAvailable(page);
    const looksReactRenderable = await isRenderableReactResult(result);
    if (!looksReactRenderable) {
      throw invalidHtmlReturn(page, result);
    }
    if (dev) {
      await validateStaticJsxTree(result, {
        page,
        onWarn(message) {
          console.warn(message);
        }
      });
    }
    const html = await renderReactResult(result);
    return ensureDoctype(html);
  } catch (error) {
    throw pageError(page, error);
  }
}

// src/module-loader.ts
import path5 from "path";
import {
  createServer,
  loadConfigFromFile
} from "vite";
function getSsrModuleRunner(server) {
  const environment = server.environments.ssr;
  const runner = environment?.runner;
  if (!runner || typeof runner.import !== "function") {
    throw new Error(
      brand(
        "The Vite SSR environment is not runnable. A RunnableDevEnvironment is required to evaluate page modules."
      )
    );
  }
  return runner;
}
async function importPageModule(server, url) {
  const runner = getSsrModuleRunner(server);
  const mod = await runner.import(url);
  return normalizeLoadedPageModule(mod);
}
function isLocalPageTypesImport(id) {
  return /^\.\/\$types(?:\.[A-Za-z0-9_.-]+)?$/.test(id);
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
async function flattenPluginOptions(option) {
  const resolved = await option;
  if (!resolved) return [];
  if (Array.isArray(resolved)) {
    const nested = await Promise.all(
      resolved.map((entry) => flattenPluginOptions(entry))
    );
    return nested.flat();
  }
  return [resolved];
}
async function loadUserConfig(args) {
  if (!args.configFile) {
    return { userConfig: {}, userPlugins: [] };
  }
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: args.mode },
    args.configFile,
    args.root
  );
  if (!loaded) {
    return { userConfig: {}, userPlugins: [] };
  }
  const plugins = await flattenPluginOptions(loaded.config.plugins);
  return {
    userConfig: loaded.config,
    // Filter ourselves out so evaluating page modules does not
    // recursively spawn more build loaders.
    userPlugins: plugins.filter((plugin) => plugin.name !== PLUGIN_NAME)
  };
}
function createPageHelperPlugin(getPages) {
  return {
    name: `${PLUGIN_NAME}:page-helper`,
    resolveId(id, importer) {
      if (id === VIRTUAL_PAGE_HELPER_ID && importer) {
        return `${RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX}${importer}`;
      }
      if (importer && isLocalPageTypesImport(id)) {
        return `${VIRTUAL_LOCAL_TYPES_PREFIX}${importer}::${id}`;
      }
      return null;
    },
    async load(id) {
      if (id.startsWith(VIRTUAL_LOCAL_TYPES_PREFIX)) {
        return `
export {
  definePage,
  defineData,
  defineStaticParams,
  definePageModule
} from 'vite-plugin-html-pages/page';
`;
      }
      if (!id.startsWith(RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX)) {
        return null;
      }
      const importer = id.slice(RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX.length);
      const pages = await getPages();
      const normalizedImporter = path5.resolve(importer);
      const page = pages.find(
        (candidate) => path5.resolve(candidate.absolutePath) === normalizedImporter
      );
      return generateTypedPageHelper(page);
    }
  };
}
async function createPageModuleLoader(args) {
  const { mode, root, server, getPages } = args;
  if (mode === "dev") {
    if (!server) {
      throw new Error(brand("dev server not available"));
    }
    return {
      loadModule: async (_entryPath, relativePath) => importPageModule(server, `/${relativePath}`),
      close: async () => {
      }
    };
  }
  if (!getPages) {
    throw new Error(brand("getPages is required in build mode"));
  }
  const configMode = args.configMode ?? "production";
  const { userConfig, userPlugins } = await loadUserConfig({
    root,
    configFile: args.configFile,
    mode: configMode
  });
  const config = {
    ...userConfig,
    root,
    // So import.meta.env.BASE_URL in a page module is what the dev
    // server gives it.
    base: args.base ?? userConfig.base,
    mode: configMode,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    esbuild: userConfig.esbuild === false ? false : {
      ...userConfig.esbuild,
      jsx: "automatic",
      jsxImportSource: PLUGIN_NAME
    },
    server: {
      ...userConfig.server,
      middlewareMode: true,
      watch: null
    },
    plugins: [...userPlugins, createPageHelperPlugin(getPages)]
  };
  const buildServer = await createServer(config);
  return {
    loadModule: async (entryPath) => {
      const relativePath = "/" + path5.relative(root, entryPath).replace(/\\/g, "/");
      return importPageModule(buildServer, relativePath);
    },
    close: async () => {
      await buildServer.close();
    }
  };
}

// src/dev-toolbar.ts
var DEFAULT_DOCS_BY_NAME = {
  sitelo: "https://sitelo.js.org/docs"
};
function resolveDevToolbarEnabled(options) {
  return options.devToolbar !== false;
}
function resolveDevToolbarDocsUrl(options) {
  if (options.devToolbarDocsUrl) return options.devToolbarDocsUrl;
  const name = (options.displayName ?? getDisplayName()).toLowerCase();
  return DEFAULT_DOCS_BY_NAME[name] ?? "https://github.com/paul-browne/vite-plugin-html-pages";
}
function buildDevToolbarInfo(args) {
  const displayName = args.options.displayName ?? getDisplayName();
  return {
    displayName,
    routePath: args.page.routePath,
    routePattern: args.page.routePattern,
    relativePath: args.page.relativePath,
    params: args.page.params ?? {},
    docsUrl: resolveDevToolbarDocsUrl(args.options),
    pluginVersion: args.pluginVersion
  };
}
function injectDevToolbar(html, info) {
  const payload = JSON.stringify(info).replace(/</g, "\\u003c");
  const snippet = `${toolbarStyles()}<script type="module" data-html-pages-dev-toolbar>${toolbarClient(payload)}</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}</body>`);
  }
  return `${html}${snippet}`;
}
function toolbarStyles() {
  return `<style data-html-pages-dev-toolbar>
#hp-dev-toolbar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483646;display:flex;align-items:center;gap:.5rem;max-width:min(96vw,52rem);padding:.4rem .65rem;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(18,18,22,.92);color:#f4f4f5;font:12px/1.3 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);backdrop-filter:blur(8px)}
#hp-dev-toolbar[hidden]{display:none!important}
#hp-dev-toolbar button,#hp-dev-toolbar a{appearance:none;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:none;padding:.2rem .45rem;border-radius:999px}
#hp-dev-toolbar button:hover,#hp-dev-toolbar a:hover{background:rgba(255,255,255,.1)}
#hp-dev-toolbar .hp-brand{font-weight:650;letter-spacing:.01em;color:#a5b4fc}
#hp-dev-toolbar .hp-sep{opacity:.35}
#hp-dev-toolbar .hp-meta{opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:14rem}
#hp-dev-toolbar .hp-pill{background:rgba(255,255,255,.08);padding:.15rem .5rem;border-radius:999px;white-space:nowrap}
#hp-dev-toolbar .hp-actions{display:flex;align-items:center;gap:.15rem;margin-left:.15rem}
@media (max-width:640px){#hp-dev-toolbar .hp-hide-sm{display:none}}
html[data-hp-vp="mobile"],html[data-hp-vp="tablet"]{background:#111114!important;height:100%}
html[data-hp-vp="mobile"] body,html[data-hp-vp="tablet"] body{margin:0;height:100%;overflow:hidden;background:#111114}
html[data-hp-vp="mobile"] body>:not(#hp-viewport-frame),html[data-hp-vp="tablet"] body>:not(#hp-viewport-frame){display:none!important}
#hp-viewport-frame{position:fixed;top:0;left:50%;transform:translateX(-50%);height:100%;border:0;z-index:2147483645;background:#111114;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 0 48px rgba(0,0,0,.35)}
html[data-hp-vp="mobile"] #hp-viewport-frame{width:390px}
html[data-hp-vp="tablet"] #hp-viewport-frame{width:768px}
</style>`;
}
function toolbarClient(payloadJson) {
  return `
(() => {
  // Preview iframes should render the page only \u2014 no nested toolbar.
  if (window !== window.top) return;

  const STORAGE_KEY = 'html-pages:dev-toolbar:hidden';
  const VIEWPORT_KEY = 'html-pages:dev-toolbar:viewport';
  if (globalThis.sessionStorage?.getItem(STORAGE_KEY) === '1') return;

  const info = ${payloadJson};
  const params = info.params && typeof info.params === 'object' ? info.params : {};
  const paramEntries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  const paramText = paramEntries.length
    ? paramEntries.map(([k, v]) => k + '=' + (Array.isArray(v) ? v.join('/') : String(v))).join(' ')
    : '';

  const VIEWPORTS = [
    { id: 'desktop', label: 'Desktop', width: null },
    { id: 'tablet', label: 'Tablet', width: 768 },
    { id: 'mobile', label: 'Mobile', width: 390 },
  ];
  let viewportIndex = VIEWPORTS.findIndex(
    (v) => v.id === globalThis.sessionStorage?.getItem(VIEWPORT_KEY),
  );
  if (viewportIndex < 0) viewportIndex = 0;

  const root = document.createElement('div');
  root.id = 'hp-dev-toolbar';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', info.displayName + ' dev toolbar');

  root.innerHTML = [
    '<span class="hp-brand">' + escapeHtml(info.displayName) + '</span>',
    '<span class="hp-sep hp-hide-sm">\xB7</span>',
    '<span class="hp-meta hp-hide-sm" title="source">' + escapeHtml(info.relativePath) + '</span>',
    paramText ? '<span class="hp-pill hp-hide-sm" title="params">' + escapeHtml(paramText) + '</span>' : '',
    '<span class="hp-pill" data-hp-islands title="server islands on this page">0 islands</span>',
    '<span class="hp-actions">',
    '<button type="button" data-hp-vp-btn title="Cycle viewport size">Desktop</button>',
    '<button type="button" data-hp-copy title="Copy debug info">Copy</button>',
    '<a href="' + escapeAttr(info.docsUrl) + '" target="_blank" rel="noopener">Docs</a>',
    '<button type="button" data-hp-hide title="Hide for this tab">\u2715</button>',
    '</span>',
  ].join('');

  document.documentElement.appendChild(root);

  const viewportBtn = root.querySelector('[data-hp-vp-btn]');
  const islandsPill = root.querySelector('[data-hp-islands]');

  function countIslands(doc) {
    return doc.querySelectorAll('[data-sitelo-island]').length;
  }

  function setIslandsLabel(n) {
    if (!islandsPill) return;
    islandsPill.textContent = n + ' island' + (n === 1 ? '' : 's');
  }

  setIslandsLabel(countIslands(document));

  function removeFrame() {
    document.getElementById('hp-viewport-frame')?.remove();
  }

  function ensureFrame() {
    let frame = document.getElementById('hp-viewport-frame');
    if (frame) return frame;

    frame = document.createElement('iframe');
    frame.id = 'hp-viewport-frame';
    frame.title = 'Viewport preview';
    frame.src = location.href;
    frame.addEventListener('load', () => {
      try {
        const doc = frame.contentDocument;
        if (doc) setIslandsLabel(countIslands(doc));
      } catch {
        /* cross-origin \u2014 ignore */
      }
    });
    document.body.appendChild(frame);
    return frame;
  }

  function applyViewport() {
    const mode = VIEWPORTS[viewportIndex];
    globalThis.sessionStorage?.setItem(VIEWPORT_KEY, mode.id);
    document.documentElement.setAttribute('data-hp-vp', mode.id);

    if (viewportBtn) {
      viewportBtn.textContent = mode.label;
      viewportBtn.title = 'Viewport: ' + mode.label + ' (click to cycle)';
    }

    if (!mode.width) {
      const frame = document.getElementById('hp-viewport-frame');
      let nextHref = null;
      try {
        const href = frame?.contentWindow?.location?.href;
        if (href && href !== location.href) nextHref = href;
      } catch {
        /* ignore */
      }
      removeFrame();
      document.documentElement.removeAttribute('data-hp-vp');
      setIslandsLabel(countIslands(document));
      if (nextHref) {
        location.href = nextHref;
      }
      return;
    }

    ensureFrame();
  }

  applyViewport();

  viewportBtn?.addEventListener('click', () => {
    viewportIndex = (viewportIndex + 1) % VIEWPORTS.length;
    applyViewport();
  });

  root.querySelector('[data-hp-copy]')?.addEventListener('click', async () => {
    const text = [
      info.displayName + ' debug info',
      'route: ' + info.routePath,
      'pattern: ' + info.routePattern,
      'file: ' + info.relativePath,
      'params: ' + JSON.stringify(params),
      'islands: ' + (islandsPill?.textContent ?? ''),
      'viewport: ' + VIEWPORTS[viewportIndex].id,
      'plugin: ' + info.pluginVersion,
      'url: ' + location.href,
      'userAgent: ' + navigator.userAgent,
    ].join('\\n');

    try {
      await navigator.clipboard.writeText(text);
      const btn = root.querySelector('[data-hp-copy]');
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = prev; }, 1200);
      }
    } catch {
      console.info(text);
    }
  });

  root.querySelector('[data-hp-hide]')?.addEventListener('click', () => {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, '1');
    root.hidden = true;
  });

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", '&#39;');
  }
})();
`;
}

// src/dev-server.ts
var PLUGIN_VERSION = JSON.parse(
  fs3.readFileSync(
    path6.join(path6.dirname(fileURLToPath2(import.meta.url)), "../package.json"),
    "utf8"
  )
).version;
function isStaticAssetRequest(url) {
  return url.endsWith(".css") || url.endsWith(".js") || url.endsWith(".mjs") || url.endsWith(".jsx") || url.endsWith(".ts") || url.endsWith(".mts") || url.endsWith(".tsx") || url.endsWith(".png") || url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".gif") || url.endsWith(".svg") || url.endsWith(".webp") || url.endsWith(".ico") || url.endsWith(".woff") || url.endsWith(".woff2") || url.endsWith(".ttf") || url.endsWith(".otf");
}
function normalizeRoutePath2(input) {
  let value = input.split("?")[0].split("#")[0];
  if (!value.startsWith("/")) value = "/" + value;
  value = value.replace(/\/+/g, "/");
  if (value.length > 1 && value.endsWith("/")) {
    value = value.slice(0, -1);
  }
  return value;
}
function stripDevBase(url, base, middlewareMode) {
  if (base === "/" || url.startsWith(base)) {
    return { url: `/${url.slice(base.length)}`, base };
  }
  return middlewareMode ? { url, base: "/" } : null;
}
function shouldSkipHtmlRouting(url, pagesDir) {
  return url.startsWith("/@vite") || url.startsWith("/@fs/") || url.startsWith("/node_modules/") || url.startsWith(`/${pagesDir}/`) || url === "/favicon.ico" || isStaticAssetRequest(url);
}
function hasDotDotSegment(url) {
  return url.split("/").includes("..");
}
function tryRewriteRootAssetToSrc(root, pagesDir, url) {
  if (!url.startsWith("/")) return null;
  if (hasDotDotSegment(url)) return null;
  if (!isStaticAssetRequest(url)) return null;
  if (url.startsWith(`/${pagesDir}/`)) return null;
  const candidate = path6.join(root, pagesDir, url.slice(1));
  if (fs3.existsSync(candidate)) {
    return `/${pagesDir}/${url.slice(1)}`;
  }
  return null;
}
function rewriteRootAssetUrlsInDevHtml(html, root, pagesDir) {
  return html.replace(
    /\b(href|src)=["'](\/[^"']+)["']/g,
    (full, attr, url) => {
      if (hasDotDotSegment(url)) return full;
      if (!isStaticAssetRequest(url)) return full;
      if (url.startsWith(`/${pagesDir}/`)) return full;
      const candidate = path6.join(root, pagesDir, url.slice(1));
      if (!fs3.existsSync(candidate)) return full;
      return `${attr}="/${pagesDir}/${url.slice(1)}"`;
    }
  );
}
function installDevServer(args) {
  const { server, root, pagesDir, options, getPages, getEntries } = args;
  const toolbarEnabled = resolveDevToolbarEnabled(options);
  const loaderPromise = createPageModuleLoader({
    mode: "dev",
    root,
    server
  });
  server.middlewares.use(async (req, res, next) => {
    try {
      const request = stripDevBase(
        req.url ?? "/",
        server.config.base,
        !!server.config.server.middlewareMode
      );
      if (!request) return next();
      const originalUrl = request.url;
      const url = normalizeRoutePath2(originalUrl);
      const rewrittenAssetUrl = tryRewriteRootAssetToSrc(root, pagesDir, url);
      if (rewrittenAssetUrl) {
        const suffixIndex = originalUrl.search(/[?#]/);
        const suffix = suffixIndex === -1 ? "" : originalUrl.slice(suffixIndex);
        req.url = request.base + rewrittenAssetUrl.slice(1) + suffix;
        return next();
      }
      if (shouldSkipHtmlRouting(url, pagesDir)) {
        return next();
      }
      const pages = await getPages();
      let page = pages.find(
        (p) => normalizeRoutePath2(p.routePath) === url
      );
      if (!page && getEntries) {
        page = matchDynamicPage(await getEntries(), url) ?? void 0;
      }
      if (!page) {
        return next();
      }
      const { loadModule } = await loaderPromise;
      const mod = await loadModule(page.entryPath, page.relativePath);
      if (!mod) {
        return next();
      }
      const html = await renderPage(page, mod, true);
      const devHtml = rewriteRootAssetUrlsInDevHtml(
        html,
        root,
        pagesDir
      );
      let transformedHtml = await server.transformIndexHtml(
        url,
        devHtml,
        req.originalUrl
      );
      if (toolbarEnabled) {
        transformedHtml = injectDevToolbar(
          transformedHtml,
          buildDevToolbarInfo({
            page,
            options,
            pluginVersion: PLUGIN_VERSION
          })
        );
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(transformedHtml);
    } catch (error) {
      server.config.logger.error(
        brand(
          `dev server render failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
        )
      );
      next(error);
    }
  });
}

// src/html-asset-validator.ts
import fs5 from "fs";
import path8 from "path";

// src/static-assets.ts
import fs4 from "fs/promises";
import path7 from "path";
import { glob as glob2 } from "tinyglobby";
import * as esbuild from "esbuild";
import fsSync from "fs";
import { transformWithOxc } from "vite";
function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}
function hasAnySuffix(value, suffixes) {
  return suffixes.some((suffix) => value.endsWith(suffix));
}
function shouldIgnoreFile(rel) {
  return rel.endsWith(".d.ts") || rel.endsWith(".map") || rel.endsWith(".tsbuildinfo") || rel.startsWith(".") || rel.includes("/.");
}
var COMPILED_TO_JS_EXTENSIONS = [".ts", ".mts", ".tsx", ".jsx", ".mjs"];
var COMMONJS_EXTENSIONS = [".cjs", ".cts"];
function isProcessableAsset(rel) {
  const ext = path7.posix.extname(rel);
  return ext === ".js" || ext === ".css" || COMPILED_TO_JS_EXTENSIONS.includes(ext);
}
function toOutputFileName(relativePathFromSrc) {
  const ext = path7.posix.extname(relativePathFromSrc);
  return COMPILED_TO_JS_EXTENSIONS.includes(ext) ? relativePathFromSrc.slice(0, -ext.length) + ".js" : relativePathFromSrc;
}
function viteJsxPlugin(config) {
  if (config.oxc === false) return null;
  const {
    jsxInject,
    include,
    exclude,
    jsxRefreshInclude,
    jsxRefreshExclude,
    ...options
  } = config.oxc;
  const jsx = typeof options.jsx === "object" ? { ...options.jsx, development: false, refresh: false } : options.jsx;
  return {
    name: "html-pages-vite-jsx",
    setup(build2) {
      build2.onLoad({ filter: /\.[jt]sx$/ }, async (loadArgs) => {
        const code = await fs4.readFile(loadArgs.path, "utf8");
        const result = await transformWithOxc(
          code,
          loadArgs.path,
          { ...options, jsx, sourcemap: false },
          void 0,
          config
        );
        return {
          contents: jsxInject ? `${jsxInject};${result.code}` : result.code,
          loader: "js"
        };
      });
    }
  };
}
async function collectStaticAssets(args) {
  const { root, pagesDir, pageExtensions } = args;
  const srcDir = path7.join(root, pagesDir);
  const entries = (await glob2("**/*", {
    cwd: srcDir,
    onlyFiles: true,
    dot: false,
    absolute: false
  })).sort();
  const assets = [];
  for (const entry of entries) {
    const rel = normalizeSlashes(entry);
    if (shouldIgnoreFile(rel)) continue;
    if (hasAnySuffix(rel, pageExtensions)) continue;
    if (COMMONJS_EXTENSIONS.includes(path7.posix.extname(rel))) continue;
    const absolutePath = path7.join(srcDir, rel);
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
  return fs4.readFile(asset.absolutePath);
}
async function buildProcessedStaticAssets(args) {
  const {
    root,
    pagesDir,
    assets,
    minify = true,
    sourcemap = false,
    viteConfig
  } = args;
  const processable = assets.filter((a) => a.kind === "process");
  const out = /* @__PURE__ */ new Map();
  if (processable.length === 0) {
    return out;
  }
  const srcDir = path7.join(root, pagesDir);
  const distDir = path7.join(root, "dist");
  const warnedMissingAssets = /* @__PURE__ */ new Set();
  const jsxPlugin = viteConfig ? viteJsxPlugin(viteConfig) : null;
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
    target: "esnext",
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
      ...jsxPlugin ? [jsxPlugin] : [],
      {
        name: "html-pages-root-url-resolver",
        setup(build2) {
          build2.onResolve({ filter: /^\// }, (resolveArgs) => {
            if (path7.isAbsolute(resolveArgs.path) && fsSync.existsSync(resolveArgs.path)) {
              return { path: resolveArgs.path };
            }
            const cleanPath = resolveArgs.path.slice(1);
            const fromSrc = path7.join(srcDir, cleanPath);
            if (fsSync.existsSync(fromSrc)) {
              return { path: fromSrc };
            }
            const fromPublic = path7.join(root, "public", cleanPath);
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
                  brand(
                    `\u26A0\uFE0F Missing CSS asset: ${resolveArgs.path}
  Looked in:
  - ${fromSrc}
  - ${fromPublic}`
                  )
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
    const rel = normalizeSlashes(path7.relative(distDir, file.path));
    out.set(rel, file.text ?? file.contents);
  }
  return out;
}

// src/html-asset-validator.ts
function isRelativeUrl(url) {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(url);
}
var SITE_ORIGIN = "http://html-pages.invalid";
var SITE_ROOT = new URL(`${SITE_ORIGIN}/`);
function siteRootUrl(base = "/") {
  if (!base || base.startsWith(".")) return SITE_ROOT;
  try {
    return new URL(base.endsWith("/") ? base : `${base}/`, SITE_ROOT);
  } catch {
    return SITE_ROOT;
  }
}
function documentBaseUrl(html, pageFileName, siteRoot) {
  const page = new URL(pageFileName.replace(/^\/+/, ""), siteRoot);
  const base = stripCodeSampleMarkup(html).match(
    /<base\b[^>]*\bhref=["']([^"']+)["']/i
  );
  if (!base) return page;
  try {
    return new URL(base[1], page);
  } catch {
    return page;
  }
}
function resolveLocalPath(url, documentBase, siteRoot) {
  if (url.startsWith("#") || url.startsWith("?")) return null;
  let resolved;
  try {
    resolved = new URL(url, documentBase);
  } catch {
    return null;
  }
  if (resolved.origin !== siteRoot.origin) return null;
  const pathname = resolved.pathname.startsWith(siteRoot.pathname) ? resolved.pathname.slice(siteRoot.pathname.length - 1) : resolved.pathname;
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}
function replaceExtension(url, from, to) {
  const suffixIndex = url.search(/[?#]/);
  const pathPart = suffixIndex === -1 ? url : url.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : url.slice(suffixIndex);
  if (!pathPart.endsWith(from)) return url;
  return pathPart.slice(0, -from.length) + to + suffix;
}
function matchesExternalAsset(urlPath, patterns) {
  return patterns.some(
    (pattern) => pattern.endsWith("/") ? urlPath.startsWith(pattern) : urlPath === pattern
  );
}
function normalizeExternalAssets(value) {
  const list = value == null ? [] : Array.isArray(value) ? value : [value];
  return list.filter(Boolean).map((entry) => entry.startsWith("/") ? entry : `/${entry}`);
}
function fileExistsForPublicPath(root, pagesDir, urlPath) {
  const clean = urlPath.slice(1);
  const fromSrc = path8.join(root, pagesDir, clean);
  if (fs5.existsSync(fromSrc)) return true;
  const fromPublic = path8.join(root, "public", clean);
  if (fs5.existsSync(fromPublic)) return true;
  return false;
}
function isUnshippedCommonJs(root, pagesDir, urlPath) {
  if (!COMMONJS_EXTENSIONS.includes(path8.posix.extname(urlPath))) return false;
  const clean = urlPath.slice(1);
  return fs5.existsSync(path8.join(root, pagesDir, clean)) && !fs5.existsSync(path8.join(root, "public", clean));
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
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel=["']?stylesheet["']?/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i);
    if (href) out.push(href[1]);
  }
  return out;
}
var CODE_SAMPLE_RE = /<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi;
function stripCodeSampleMarkup(html) {
  return html.replace(CODE_SAMPLE_RE, "");
}
function mapOutsideCodeSamples(html, map) {
  let out = "";
  let last = 0;
  for (const match of html.matchAll(CODE_SAMPLE_RE)) {
    out += map(html.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + map(html.slice(last));
}
function collectLiteralDynamicImports(html) {
  const out = [];
  const withoutSamples = stripCodeSampleMarkup(html);
  for (const match of withoutSamples.matchAll(
    /import\s*\(\s*["']([^"'`]+)["']\s*\)/gi
  )) {
    out.push(match[1]);
  }
  return out;
}
function unique(values) {
  return [...new Set(values)];
}
function collectHrefSrcUrls(html) {
  const out = [];
  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    out.push(match[1]);
  }
  return out;
}
function collectLocalAssetUrls(html, pageFileName = "index.html", base = "/") {
  const siteRoot = siteRootUrl(base);
  const documentBase = documentBaseUrl(html, pageFileName, siteRoot);
  const candidates = [
    ...collectHrefSrcUrls(html),
    ...collectLiteralDynamicImports(html)
  ];
  return unique(
    candidates.map((url) => resolveLocalPath(url, documentBase, siteRoot)).filter((urlPath) => urlPath !== null)
  );
}
function rewriteCompiledAssetUrls(html, pageFileName, outputPaths, base = "/") {
  if (outputPaths.size === 0) return html;
  const siteRoot = siteRootUrl(base);
  const documentBase = documentBaseUrl(html, pageFileName, siteRoot);
  const rewrite = (url) => {
    const source = resolveLocalPath(url, documentBase, siteRoot);
    const output = source && outputPaths.get(source);
    if (!source || !output) return url;
    return replaceExtension(
      url,
      path8.posix.extname(source),
      path8.posix.extname(output)
    );
  };
  return mapOutsideCodeSamples(
    html,
    (chunk) => chunk.replace(
      /\b(href|src)=(["'])([^"']+)\2/gi,
      (_, attr, quote, url) => `${attr}=${quote}${rewrite(url)}${quote}`
    ).replace(
      /(import\s*\(\s*["'])([^"'`]+)(["']\s*\))/gi,
      (_, open, url, close) => `${open}${rewrite(url)}${close}`
    )
  );
}
function formatPageLabel(pageLabel) {
  return pageLabel ? ` (${pageLabel})` : "";
}
function suggestAlternative(args) {
  const { url, resolved, siteRoot, root, pagesDir } = args;
  const basePath = siteRoot.pathname;
  if (basePath !== "/" && resolved.startsWith(basePath)) {
    const once = resolved.slice(basePath.length - 1);
    if (fileExistsForPublicPath(root, pagesDir, once)) {
      return `It has Vite's base (${basePath}) twice: page HTML is written for the site root, and the base is added to asset URLs for you, in dev and build alike. Write "${once}".`;
    }
  }
  if (isRelativeUrl(url)) {
    const fromRoot = resolveLocalPath(url, SITE_ROOT, SITE_ROOT);
    if (fromRoot && fileExistsForPublicPath(root, pagesDir, fromRoot)) {
      return `Did you mean "${fromRoot}"? A relative URL resolves against the page's own location, so it changes from page to page.`;
    }
  }
  if (resolved.endsWith(".js")) {
    for (const ext of COMPILED_TO_JS_EXTENSIONS) {
      const source = path8.join(pagesDir, resolved.slice(1, -3) + ext);
      if (fs5.existsSync(path8.join(root, source))) {
        return `Did you mean "${replaceExtension(url, ".js", ext)}"? Reference ${source} by its source name: the dev server serves it as is, and the build points the page at the .js it compiles to.`;
      }
    }
  }
  return null;
}
function missingAssetMessage(args) {
  const { pluginName, kind, url, resolved, from, siteRoot, root, pagesDir, pageLabel } = args;
  const clean = resolved.slice(1);
  const lines = [`[${pluginName}] Missing ${kind}${formatPageLabel(pageLabel)}: ${url}`];
  if (isRelativeUrl(url)) {
    lines.push(`Resolves to ${resolved} from ${from}`);
  }
  lines.push(
    `Expected one of:`,
    `- ${path8.join(root, pagesDir, clean)}`,
    `- ${path8.join(root, "public", clean)}`
  );
  const alternative = suggestAlternative({ url, resolved, siteRoot, root, pagesDir });
  if (alternative) lines.push(alternative);
  return lines.join("\n");
}
function commonJsMessage(args) {
  const { pluginName, kind, url, resolved, pagesDir, pageLabel } = args;
  const source = path8.posix.join(pagesDir, resolved.slice(1));
  return [
    `[${pluginName}] Missing ${kind}${formatPageLabel(pageLabel)}: ${url}`,
    `${source} is CommonJS, which browsers can't load, so the build never emits it.`,
    `Write it as an ES module (.js, .mjs, .ts, .mts), or put a file meant to ship as is in public/.`
  ].join("\n");
}
function reportMissing(mode, message) {
  if (mode === "warn") {
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
    pageFileName = "index.html",
    missingAssets = "error",
    externalAssets,
    base = "/"
  } = options;
  const external = normalizeExternalAssets(externalAssets);
  const siteRoot = siteRootUrl(base);
  const documentBase = documentBaseUrl(html, pageFileName, siteRoot);
  const from = resolveLocalPath(documentBase.href, documentBase, siteRoot) ?? "/";
  const findMissing = (urls, kind) => {
    const messages = [];
    for (const url of unique(urls)) {
      const resolved = resolveLocalPath(url, documentBase, siteRoot);
      if (resolved === null || matchesExternalAsset(resolved, external)) continue;
      if (isUnshippedCommonJs(root, pagesDir, resolved)) {
        messages.push(
          commonJsMessage({ pluginName, kind, url, resolved, pagesDir, pageLabel })
        );
        continue;
      }
      if (fileExistsForPublicPath(root, pagesDir, resolved)) continue;
      messages.push(
        missingAssetMessage({
          pluginName,
          kind,
          url,
          resolved,
          from,
          siteRoot,
          root,
          pagesDir,
          pageLabel
        })
      );
    }
    return messages;
  };
  for (const message of findMissing(collectScriptSrcs(html), "JavaScript asset")) {
    reportMissing(missingAssets, message);
  }
  for (const message of findMissing(collectStylesheetHrefs(html), "stylesheet asset")) {
    reportMissing(missingAssets, message);
  }
  for (const message of findMissing(
    collectLiteralDynamicImports(html),
    "literal dynamic import"
  )) {
    console.warn(`\u26A0\uFE0F ${message}`);
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
      const paramRows = Array.isArray(rows) ? rows : [];
      if (paramRows.length === 0) {
        console.warn(
          brand(
            `\u26A0\uFE0F Dynamic page "${entry.relativePath}" generated no routes. Export generateStaticParams() returning at least one params object to emit pages for it.`
          )
        );
      }
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
          paramRows,
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
        brand(
          `Duplicate route generated: "${page.routePath}" from "${existing.relativePath}" and "${page.relativePath}"`
        )
      );
    }
    seenRoutes.set(page.routePath, page);
  }
  return pages;
}

// src/plugin.ts
var hasWarnedESM = false;
var pluginDir = path9.dirname(fileURLToPath3(import.meta.url));
function warnIfNotESM(root) {
  try {
    const pkgPath = path9.join(root, "package.json");
    if (!fs6.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs6.readFileSync(pkgPath, "utf8"));
    if (pkg.type !== "module") {
      console.warn(
        brand(
          '\u26A0\uFE0F It is recommended to add "type": "module" to your package.json for optimal performance and to avoid Node ESM warnings.'
        )
      );
    }
  } catch {
  }
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
function defaultNotFoundHtml(base) {
  const home = base.endsWith("/") ? base : `${base}/`;
  return `<!doctype html>
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
      <p><a href="${home}">Go back home</a></p>
    </main>
  </body>
</html>
`;
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
  setDisplayName(options.displayName);
  let root = process.cwd();
  let server = null;
  let devPages = [];
  let watcherAttached = false;
  let userConfigFile;
  let resolvedMode = "production";
  let resolvedBase = "/";
  let viteConfig;
  let buildPipelinePromise = null;
  const cleanUrls = options.cleanUrls ?? true;
  const pagesDir = options.pagesDir ?? "src";
  const pageExtensions = options.pageExtensions?.length ? options.pageExtensions : DEFAULT_PAGE_EXTENSIONS;
  function logDebug(enabled, ...args) {
    if (!enabled) return;
    console.log(`[${getDisplayName()}]`, ...args);
  }
  async function loadDevPages() {
    const entries = await discoverEntryPages(root, options);
    await writePageTypeDeclarations({
      root,
      pagesDir,
      entries,
      generatedTypesDir: options.generatedTypesDir
    });
    const modulesByEntry = /* @__PURE__ */ new Map();
    logDebug(
      options.debug,
      "discovered entries",
      entries.map((e) => e.relativePath)
    );
    if (!server) return [];
    const loader = await createPageModuleLoader({
      mode: "dev",
      root,
      server
    });
    for (const entry of entries) {
      const mod = await loader.loadModule(entry.entryPath, entry.relativePath);
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
  async function createBuildPipeline() {
    const entries = await discoverEntryPages(root, options);
    await writePageTypeDeclarations({
      root,
      pagesDir,
      entries,
      generatedTypesDir: options.generatedTypesDir
    });
    const loader = await createPageModuleLoader({
      mode: "build",
      root,
      getPages: async () => entries,
      configFile: userConfigFile,
      configMode: resolvedMode,
      base: resolvedBase
    });
    try {
      const modulesByEntry = /* @__PURE__ */ new Map();
      for (const entry of entries) {
        const mod = await loader.loadModule(
          entry.entryPath,
          entry.relativePath
        );
        modulesByEntry.set(entry.entryPath, mod);
      }
      const pages = await buildPageIndex({
        entries,
        modulesByEntry,
        cleanUrls
      });
      return { entries, modulesByEntry, pages, closeLoader: loader.close };
    } catch (error) {
      await loader.close();
      throw error;
    }
  }
  function getBuildPipeline() {
    if (!buildPipelinePromise) {
      buildPipelinePromise = createBuildPipeline();
    }
    return buildPipelinePromise;
  }
  async function closeBuildPipeline() {
    const pending = buildPipelinePromise;
    buildPipelinePromise = null;
    if (!pending) return;
    try {
      const pipeline = await pending;
      await pipeline.closeLoader();
    } catch {
    }
  }
  return {
    name: PLUGIN_NAME,
    config(userConfig, env2) {
      if (env2.command !== "build") return;
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
      if (importer && isLocalPageTypesImport(id)) {
        return `${VIRTUAL_LOCAL_TYPES_PREFIX}${importer}::${id}`;
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
          pathToFileURL(path9.join(pluginDir, "jsx-runtime.js")).href
        )};
`;
      }
      if (id === RESOLVED_VIRTUAL_JSX_DEV_RUNTIME_ID) {
        return `
export { Fragment, jsx, jsxs, jsxDEV } from ${JSON.stringify(
          pathToFileURL(path9.join(pluginDir, "jsx-dev-runtime.js")).href
        )};
`;
      }
      if (id.startsWith(RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX)) {
        const importer = id.slice(RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX.length);
        const entries = await discoverEntryPages(root, options);
        const normalizedImporter = path9.resolve(importer);
        const page = entries.find(
          (candidate) => path9.resolve(candidate.absolutePath) === normalizedImporter
        );
        return generateTypedPageHelper(page);
      }
      if (id.startsWith(VIRTUAL_LOCAL_TYPES_PREFIX)) {
        return `
export {
  definePage,
  defineData,
  defineStaticParams,
  definePageModule
} from 'vite-plugin-html-pages/page';
`;
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
        target: "esnext"
      });
      return {
        code: result.code,
        map: result.map
      };
    },
    configResolved(resolved) {
      setDisplayName(options.displayName);
      root = options.root ? path9.resolve(resolved.root, options.root) : resolved.root;
      userConfigFile = resolved.configFile ?? void 0;
      resolvedMode = resolved.mode;
      resolvedBase = resolved.base || "/";
      viteConfig = resolved;
      if (!hasWarnedESM) {
        warnIfNotESM(root);
        hasWarnedESM = true;
      }
    },
    async buildStart() {
      await closeBuildPipeline();
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
        options,
        getPages: async () => {
          if (devPages.length > 0) return devPages;
          return loadDevPages();
        },
        getEntries: async () => discoverEntryPages(root, options)
      });
      if (!watcherAttached) {
        watcherAttached = true;
        const reloadAfterChange = async (file) => {
          logDebug(options.debug, "file changed", file);
          try {
            await loadDevPages();
            server?.ws.send({
              type: "full-reload",
              path: "*"
            });
          } catch (error) {
            server?.config.logger.error(
              formatDevPageError({
                error,
                root,
                phase: "reload",
                debug: options.debug
              })
            );
          }
        };
        const pagesRoot = path9.join(root, pagesDir);
        const reload = (file) => {
          const relative = path9.relative(pagesRoot, file);
          if (relative === "" || relative.startsWith("..") || path9.isAbsolute(relative) || relative.split(path9.sep).includes("node_modules")) {
            return;
          }
          void reloadAfterChange(file);
        };
        server.watcher.on("add", reload);
        server.watcher.on("change", reload);
        server.watcher.on("unlink", reload);
      }
      void loadDevPages().catch((error) => {
        server?.config.logger.error(
          formatDevPageError({
            error,
            root,
            phase: "load",
            debug: options.debug
          })
        );
      });
    },
    async generateBundle(_, bundle) {
      try {
        const { modulesByEntry, pages } = await getBuildPipeline();
        logDebug(
          options.debug,
          "emitting pages",
          pages.map((p) => p.fileName)
        );
        const limit = pLimit(options.renderConcurrency ?? 8);
        const batchSize = options.renderBatchSize ?? Math.max(options.renderConcurrency ?? 8, 32);
        const renderedPages = [];
        let notFoundSource;
        const withBase = (source, fileName) => applyBaseToHtml(
          source,
          pageBase(resolvedBase, fileName),
          viteConfig?.html?.additionalAssetSources
        );
        for (const batch of chunkArray(pages, batchSize)) {
          await Promise.all(
            batch.map(
              (page) => limit(async () => {
                const mod = modulesByEntry.get(page.entryPath);
                if (!mod) {
                  throw new Error(
                    brand(`Missing module for page entry: ${page.entryPath}`)
                  );
                }
                const source = await renderPage(page, mod, false);
                const fileName = options.mapOutputPath?.(page) ?? page.fileName;
                const html = withBase(source, fileName);
                validateHtmlAssetReferences({
                  root,
                  pagesDir,
                  html,
                  pluginName: PLUGIN_NAME,
                  pageLabel: page.relativePath,
                  pageFileName: fileName,
                  missingAssets: options.missingAssets ?? "error",
                  externalAssets: options.externalAssets,
                  base: resolvedBase
                });
                if (page.routePath === "/404") notFoundSource = source;
                renderedPages.push({ page, fileName, html });
              })
            )
          );
        }
        const notFoundHtml = notFoundSource != null ? withBase(notFoundSource, "404.html") : defaultNotFoundHtml(resolvedBase);
        logDebug(
          options.debug,
          notFoundSource != null ? "generated 404.html from user page" : "generated default 404.html"
        );
        const referencedUrls = /* @__PURE__ */ new Set();
        for (const { fileName, html } of renderedPages) {
          for (const url of collectLocalAssetUrls(html, fileName, resolvedBase)) {
            referencedUrls.add(url);
          }
        }
        for (const url of collectLocalAssetUrls(notFoundHtml, "404.html", resolvedBase)) {
          referencedUrls.add(url);
        }
        const staticAssets = await collectStaticAssets({
          root,
          pagesDir,
          pageExtensions
        });
        const isReferenced = (asset) => referencedUrls.has(`/${asset.relativePathFromSrc}`);
        const processableAssets = [];
        const skippedAssets = [];
        for (const asset of staticAssets) {
          if (asset.kind !== "process") continue;
          if (isReferenced(asset)) {
            processableAssets.push(asset);
          } else {
            skippedAssets.push(asset);
          }
        }
        if (skippedAssets.length > 0) {
          logDebug(
            options.debug,
            "skipping unreferenced code assets",
            skippedAssets.map((asset) => asset.relativePathFromSrc)
          );
        }
        logDebug(
          options.debug,
          "emitting static assets",
          staticAssets.filter((asset) => asset.kind === "copy" || isReferenced(asset)).map((asset) => ({
            kind: asset.kind,
            input: asset.relativePathFromSrc,
            output: asset.outputFileName
          }))
        );
        const processedOutputs = await buildProcessedStaticAssets({
          root,
          pagesDir,
          assets: processableAssets,
          minify: true,
          sourcemap: false,
          viteConfig
        });
        for (const [fileName, source] of processedOutputs) {
          this.emitFile({
            type: "asset",
            fileName,
            source
          });
        }
        const compiledOutputPaths = /* @__PURE__ */ new Map();
        for (const asset of processableAssets) {
          if (asset.outputFileName !== asset.relativePathFromSrc) {
            compiledOutputPaths.set(
              `/${asset.relativePathFromSrc}`,
              `/${asset.outputFileName}`
            );
          }
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
        for (const { fileName, html } of renderedPages) {
          this.emitFile({
            type: "asset",
            fileName,
            source: rewriteCompiledAssetUrls(
              html,
              fileName,
              compiledOutputPaths,
              resolvedBase
            )
          });
        }
        this.emitFile({
          type: "asset",
          fileName: "404.html",
          source: rewriteCompiledAssetUrls(
            notFoundHtml,
            "404.html",
            compiledOutputPaths,
            resolvedBase
          )
        });
        const sitemapBase = (options.site ?? "").replace(/\/+$/, "");
        const sitemapRoutes = [...new Set(pages.map((p) => p.routePath))].filter(
          (route) => !route.includes(":") && !route.includes("*")
        );
        if (sitemapBase && sitemapRoutes.length > 0) {
          const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapRoutes.map(
            (route) => `  <url><loc>${escapeXml(`${sitemapBase}${route}`)}</loc></url>`
          ).join("\n")}
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
          const rssSite = rss.site.replace(/\/+$/, "");
          const rssItems = pages.filter((page) => page.routePath.startsWith(routePrefix)).map((page) => {
            const url = escapeXml(`${rssSite}${page.routePath}`);
            return `  <item>
    <title>${escapeXml(page.routePath)}</title>
    <link>${url}</link>
    <guid>${url}</guid>
  </item>`;
          }).join("\n");
          const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(rss.title ?? getDisplayName())}</title>
  <link>${escapeXml(rssSite)}</link>
  <description>${escapeXml(rss.description ?? "RSS feed")}</description>
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
        await closeBuildPipeline();
      }
    },
    async buildEnd(error) {
      if (error) {
        await closeBuildPipeline();
      }
    },
    async closeBundle() {
      await closeBuildPipeline();
    }
  };
}

// src/fetch-cache.ts
import fs7 from "fs/promises";
import path10 from "path";
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
var SAFE_FILE_KEY_RE = /^[A-Za-z0-9._-]{1,200}$/;
function toSafeFileKey(cacheKey) {
  if (SAFE_FILE_KEY_RE.test(cacheKey)) {
    return cacheKey;
  }
  return createHash("sha256").update(cacheKey).digest("hex");
}
function getCacheFilePath(cacheKey) {
  return path10.join(
    process.cwd(),
    CACHE_DIR_NAME,
    "fetch",
    `${toSafeFileKey(cacheKey)}.json`
  );
}
function getEffectiveCacheMode(mode) {
  if (mode === "memory" || mode === "fs" || mode === "none") {
    return mode;
  }
  return process.env.NODE_ENV === "production" ? "fs" : "memory";
}
var BODY_ENCODING_HEADERS = /* @__PURE__ */ new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding"
]);
function sanitizeHeaders(headers) {
  return [...headers.entries()].filter(
    ([name]) => !BODY_ENCODING_HEADERS.has(name.toLowerCase())
  );
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
    await fs7.mkdir(path10.dirname(filePath), { recursive: true });
    if (!options.forceRefresh) {
      try {
        const raw = await fs7.readFile(filePath, "utf8");
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
  const headers = sanitizeHeaders(res.headers);
  if (res.ok) {
    const record = {
      timestamp: Date.now(),
      status: res.status,
      statusText: res.statusText,
      headers,
      body
    };
    if (cacheMode === "memory") {
      memoryCache.set(cacheKey, record);
    } else if (cacheMode === "fs") {
      await fs7.writeFile(filePath, JSON.stringify(record), "utf8");
    }
  }
  return new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}
export {
  htPages as default,
  fetchWithCache
};
/*!
 * Vendored from picocolors@1.1.1, ported to TypeScript.
 *
 * https://github.com/alexeyraspopov/picocolors
 *
 * ISC License
 *
 * Copyright (c) 2021-2024 Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
/*!
 * Vendored from p-limit@7.3.3 and its only dependency yocto-queue@1.2.2,
 * ported to TypeScript.
 *
 * https://github.com/sindresorhus/p-limit
 * https://github.com/sindresorhus/yocto-queue
 *
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */
//# sourceMappingURL=index.js.map