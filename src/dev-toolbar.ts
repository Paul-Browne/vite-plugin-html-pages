import { getDisplayName } from './brand';
import type { HtPageInfo, HtPagesPluginOptions } from './types';

export interface DevToolbarPageInfo {
  displayName: string;
  routePath: string;
  routePattern: string;
  relativePath: string;
  params: Record<string, unknown>;
  docsUrl: string;
  pluginVersion: string;
}

const DEFAULT_DOCS_BY_NAME: Record<string, string> = {
  sitelo: 'https://sitelo.js.org/docs',
};

export function resolveDevToolbarEnabled(
  options: HtPagesPluginOptions,
): boolean {
  return options.devToolbar !== false;
}

export function resolveDevToolbarDocsUrl(
  options: HtPagesPluginOptions,
): string {
  if (options.devToolbarDocsUrl) return options.devToolbarDocsUrl;

  const name = (options.displayName ?? getDisplayName()).toLowerCase();
  return (
    DEFAULT_DOCS_BY_NAME[name] ??
    'https://github.com/paul-browne/vite-plugin-html-pages'
  );
}

export function buildDevToolbarInfo(args: {
  page: HtPageInfo;
  options: HtPagesPluginOptions;
  pluginVersion: string;
}): DevToolbarPageInfo {
  const displayName = args.options.displayName ?? getDisplayName();

  return {
    displayName,
    routePath: args.page.routePath,
    routePattern: args.page.routePattern,
    relativePath: args.page.relativePath,
    params: args.page.params ?? {},
    docsUrl: resolveDevToolbarDocsUrl(args.options),
    pluginVersion: args.pluginVersion,
  };
}

/**
 * Inject a lightweight, dev-only toolbar before `</body>`.
 * Never call this on production builds.
 */
export function injectDevToolbar(
  html: string,
  info: DevToolbarPageInfo,
): string {
  const payload = JSON.stringify(info).replace(/</g, '\\u003c');
  const snippet = `${toolbarStyles()}<script type="module" data-html-pages-dev-toolbar>${toolbarClient(payload)}</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}</body>`);
  }

  return `${html}${snippet}`;
}

function toolbarStyles(): string {
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
html[data-hp-viewport="mobile"],html[data-hp-viewport="tablet"]{background:#111114}
html[data-hp-viewport="mobile"] body,html[data-hp-viewport="tablet"] body{margin-inline:auto;min-height:100vh;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 0 48px rgba(0,0,0,.35)}
html[data-hp-viewport="mobile"] body{max-width:390px}
html[data-hp-viewport="tablet"] body{max-width:768px}
</style>`;
}

function toolbarClient(payloadJson: string): string {
  // Keep this self-contained: no imports, works as an inline module.
  return `
(() => {
  const STORAGE_KEY = 'html-pages:dev-toolbar:hidden';
  const VIEWPORT_KEY = 'html-pages:dev-toolbar:viewport';
  if (globalThis.sessionStorage?.getItem(STORAGE_KEY) === '1') return;

  const info = ${payloadJson};
  const islands = document.querySelectorAll('[data-sitelo-island]');
  const params = info.params && typeof info.params === 'object' ? info.params : {};
  const paramEntries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  const paramText = paramEntries.length
    ? paramEntries.map(([k, v]) => k + '=' + (Array.isArray(v) ? v.join('/') : String(v))).join(' ')
    : '';

  const VIEWPORTS = [
    { id: 'desktop', label: 'Desktop' },
    { id: 'tablet', label: 'Tablet' },
    { id: 'mobile', label: 'Mobile' },
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
    '<span class="hp-sep hp-hide-sm">·</span>',
    '<span class="hp-meta hp-hide-sm" title="source">' + escapeHtml(info.relativePath) + '</span>',
    paramText ? '<span class="hp-pill hp-hide-sm" title="params">' + escapeHtml(paramText) + '</span>' : '',
    '<span class="hp-pill" title="server islands on this page">' + islands.length + ' island' + (islands.length === 1 ? '' : 's') + '</span>',
    '<span class="hp-actions">',
    '<button type="button" data-hp-viewport title="Cycle viewport size">Desktop</button>',
    '<button type="button" data-hp-copy title="Copy debug info">Copy</button>',
    '<a href="' + escapeAttr(info.docsUrl) + '" target="_blank" rel="noopener">Docs</a>',
    '<button type="button" data-hp-hide title="Hide for this tab">✕</button>',
    '</span>',
  ].join('');

  document.documentElement.appendChild(root);

  const viewportBtn = root.querySelector('[data-hp-viewport]');

  function applyViewport() {
    const mode = VIEWPORTS[viewportIndex];
    document.documentElement.setAttribute('data-hp-viewport', mode.id);
    globalThis.sessionStorage?.setItem(VIEWPORT_KEY, mode.id);
    if (viewportBtn) {
      viewportBtn.textContent = mode.label;
      viewportBtn.title = 'Viewport: ' + mode.label + ' (click to cycle)';
    }
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
      'islands: ' + islands.length,
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
