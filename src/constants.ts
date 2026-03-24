export const PLUGIN_NAME = 'vite-plugin-html-pages';
export const VIRTUAL_BUILD_ENTRY_ID = `\0${PLUGIN_NAME}:build-entry`;
export const VIRTUAL_PAGE_HELPER_ID = `${PLUGIN_NAME}/page`;
export const RESOLVED_VIRTUAL_PAGE_HELPER_PREFIX =`\0${PLUGIN_NAME}/page:`;
export const VIRTUAL_MANIFEST_ID = `\0virtual:${PLUGIN_NAME}-manifest`;
export const CACHE_DIR_NAME = `node_modules/.cache/${PLUGIN_NAME}`;