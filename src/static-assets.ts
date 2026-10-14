import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import * as esbuild from 'esbuild';
import fsSync from 'node:fs';
import { transformWithOxc, type ResolvedConfig } from 'vite';
import { brand } from './brand.js';

export interface StaticAssetFile {
  absolutePath: string;
  relativePathFromSrc: string;
  outputFileName: string;
  kind: 'copy' | 'process';
}

export interface CollectStaticAssetsArgs {
  root: string;
  pagesDir: string;
  pageExtensions: string[];
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function hasAnySuffix(value: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => value.endsWith(suffix));
}

function shouldIgnoreFile(rel: string): boolean {
  return (
    rel.endsWith('.d.ts') ||
    rel.endsWith('.map') ||
    rel.endsWith('.tsbuildinfo') ||
    rel.startsWith('.') ||
    rel.includes('/.')
  );
}

/**
 * Script sources esbuild writes out as `.js`. Pages reference them by
 * their source name, which is what the dev server serves, and the build
 * rewrites those URLs to the output name.
 */
export const COMPILED_TO_JS_EXTENSIONS = ['.ts', '.mts', '.tsx', '.jsx', '.mjs'];

/**
 * CommonJS, which browsers can't load. The build never emits these from
 * the pages directory, referenced or not, so server-side code in them
 * stays out of dist.
 */
export const COMMONJS_EXTENSIONS = ['.cjs', '.cts'];

function isProcessableAsset(rel: string): boolean {
  const ext = path.posix.extname(rel);

  return ext === '.js' || ext === '.css' || COMPILED_TO_JS_EXTENSIONS.includes(ext);
}

function toOutputFileName(relativePathFromSrc: string): string {
  // By extension, not suffix: `.ts` is also the tail of `.mts`.
  const ext = path.posix.extname(relativePathFromSrc);

  return COMPILED_TO_JS_EXTENSIONS.includes(ext)
    ? relativePathFromSrc.slice(0, -ext.length) + '.js'
    : relativePathFromSrc;
}

/**
 * Compiles JSX with the dev server's own transform and settings: tsconfig
 * `jsx` / `jsxImportSource` (which Vite reads for `.tsx` but not
 * `.jsx`), `oxc.jsx` from the Vite config, else React's automatic
 * runtime. Left to itself, esbuild would apply tsconfig to `.jsx` too,
 * ignore the Vite config, and fall back to `React.createElement`.
 */
function viteJsxPlugin(config: ResolvedConfig): esbuild.Plugin | null {
  if (config.oxc === false) return null;

  const {
    jsxInject,
    include,
    exclude,
    jsxRefreshInclude,
    jsxRefreshExclude,
    ...options
  } = config.oxc;
  // Same runtime, production flavour: Vite sets `development` from
  // NODE_ENV, and this is a minified bundle whatever NODE_ENV says.
  const jsx =
    typeof options.jsx === 'object'
      ? { ...options.jsx, development: false, refresh: false }
      : options.jsx;

  return {
    name: 'html-pages-vite-jsx',
    setup(build) {
      build.onLoad({ filter: /\.[jt]sx$/ }, async (loadArgs) => {
        const code = await fs.readFile(loadArgs.path, 'utf8');
        const result = await transformWithOxc(
          code,
          loadArgs.path,
          { ...options, jsx, sourcemap: false },
          undefined,
          config,
        );

        return {
          contents: jsxInject ? `${jsxInject};${result.code}` : result.code,
          loader: 'js',
        };
      });
    },
  };
}

export async function collectStaticAssets(
  args: CollectStaticAssetsArgs,
): Promise<StaticAssetFile[]> {
  const { root, pagesDir, pageExtensions } = args;
  const srcDir = path.join(root, pagesDir);

  // Sorted, as the walk order is the filesystem's and this feeds esbuild.
  const entries = (
    await glob('**/*', {
      cwd: srcDir,
      onlyFiles: true,
      dot: false,
      absolute: false,
    })
  ).sort();

  const assets: StaticAssetFile[] = [];

  for (const entry of entries) {
    const rel = normalizeSlashes(entry);

    if (shouldIgnoreFile(rel)) continue;
    if (hasAnySuffix(rel, pageExtensions)) continue;
    if (COMMONJS_EXTENSIONS.includes(path.posix.extname(rel))) continue;

    const absolutePath = path.join(srcDir, rel);

    assets.push({
      absolutePath,
      relativePathFromSrc: rel,
      outputFileName: normalizeSlashes(toOutputFileName(rel)),
      kind: isProcessableAsset(rel) ? 'process' : 'copy',
    });
  }

  return assets;
}

export async function copyStaticAssetSource(
  asset: StaticAssetFile,
): Promise<Uint8Array> {
  return fs.readFile(asset.absolutePath);
}

export async function buildProcessedStaticAssets(args: {
    root: string;
    pagesDir: string;
    assets: StaticAssetFile[];
    minify?: boolean;
    sourcemap?: boolean;
    /** The resolved Vite config, so JSX compiles as it does in dev. */
    viteConfig?: ResolvedConfig;
  }): Promise<Map<string, string | Uint8Array>> {
    const {
      root,
      pagesDir,
      assets,
      minify = true,
      sourcemap = false,
      viteConfig,
    } = args;
  
    const processable = assets.filter((a) => a.kind === 'process');
    const out = new Map<string, string | Uint8Array>();
  
    if (processable.length === 0) {
      return out;
    }
  
    const srcDir = path.join(root, pagesDir);
    const distDir = path.join(root, 'dist');
    const warnedMissingAssets = new Set<string>();
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
      format: 'esm',
      target: 'esnext',
      platform: 'browser',
      write: false,
      entryNames: '[dir]/[name]',
      assetNames: '[dir]/[name]',
      loader: {
        '.css': 'css',
        '.png': 'file',
        '.jpg': 'file',
        '.jpeg': 'file',
        '.gif': 'file',
        '.svg': 'file',
        '.webp': 'file',
        '.woff': 'file',
        '.woff2': 'file',
        '.ttf': 'file',
        '.otf': 'file',
      },
      plugins: [
        ...(jsxPlugin ? [jsxPlugin] : []),
        {
          name: 'html-pages-root-url-resolver',
          setup(build) {
            build.onResolve({ filter: /^\// }, (resolveArgs) => {
              // Leave real filesystem absolute paths alone
              if (
                path.isAbsolute(resolveArgs.path) &&
                fsSync.existsSync(resolveArgs.path)
              ) {
                return { path: resolveArgs.path };
              }
      
              const cleanPath = resolveArgs.path.slice(1);
      
              const fromSrc = path.join(srcDir, cleanPath);
              if (fsSync.existsSync(fromSrc)) {
                return { path: fromSrc };
              }
      
              const fromPublic = path.join(root, 'public', cleanPath);
              if (fsSync.existsSync(fromPublic)) {
                return {
                  path: resolveArgs.path,
                  external: true,
                };
              }
      
              const isCssUrlToken = resolveArgs.kind === 'url-token';
      
              if (isCssUrlToken) {
                if (!warnedMissingAssets.has(resolveArgs.path)) {
                  warnedMissingAssets.add(resolveArgs.path);
                  console.warn(
                    brand(
                      `⚠️ Missing CSS asset: ${resolveArgs.path}\n` +
                        `  Looked in:\n` +
                        `  - ${fromSrc}\n` +
                        `  - ${fromPublic}`,
                    ),
                  );
                }
      
                // Keep the original root-relative URL in output CSS
                return {
                  path: resolveArgs.path,
                  external: true,
                };
              }
      
              // JS/CSS entry imports remain strict
              return {
                path: fromSrc,
              };
            });
          },
        },
      ],
    });
  
    for (const file of result.outputFiles) {
      const rel = normalizeSlashes(path.relative(distDir, file.path));
      out.set(rel, file.text ?? file.contents);
    }
  
    return out;
  }
