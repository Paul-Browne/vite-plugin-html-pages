export const PLUGIN_NAME = 'vite-plugin-html-pages';
export const VIRTUAL_BUILD_ENTRY_ID = `\0${PLUGIN_NAME}:build-entry`;
export const VIRTUAL_PAGE_HELPER_ID = `${PLUGIN_NAME}/page`;
export const RESOLVED_VIRTUAL_PAGE_HELPER_ID = `\0${VIRTUAL_PAGE_HELPER_ID}`;
export const CACHE_ROOT = 'node_modules/.cache';

export const DEFAULT_PAGE_EXTENSIONS: string[] = [
  '.ht.js',
  '.html.js',
  '.ht.ts',
  '.html.ts',
  '.ht.jsx',
  '.html.jsx',
  '.ht.tsx',
  '.html.tsx',
];
export const VIRTUAL_JSX_RUNTIME_ID = `${PLUGIN_NAME}/jsx-runtime`;
export const VIRTUAL_JSX_DEV_RUNTIME_ID = `${PLUGIN_NAME}/jsx-dev-runtime`;
export const RESOLVED_VIRTUAL_JSX_RUNTIME_ID = `\0${VIRTUAL_JSX_RUNTIME_ID}`;
export const RESOLVED_VIRTUAL_JSX_DEV_RUNTIME_ID = `\0${VIRTUAL_JSX_DEV_RUNTIME_ID}`;
export const VIRTUAL_LOCAL_TYPES_PREFIX = `\0${PLUGIN_NAME}:local-types:`;