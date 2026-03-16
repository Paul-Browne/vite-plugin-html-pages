import { invalidHtmlReturn, pageError, missingDefaultExport } from './errors';
import type { HtPageInfo, HtPageModule, HtPageRenderContext } from './types';

export async function renderPage(
  page: HtPageInfo,
  mod: HtPageModule,
  dev = false,
): Promise<string> {
  const ctx: HtPageRenderContext = {
    page,
    params: page.params,
    dev,
  };

  try {
    if (typeof mod.data === 'function') {
      ctx.data = await mod.data(ctx);
    }

    const entry = mod.default;

    if (entry == null) {
      throw missingDefaultExport(page);
    }

    const html = typeof entry === 'function' ? await entry(ctx) : entry;

    if (typeof html !== 'string') {
      throw invalidHtmlReturn(page, html);
    }

    return html;
  } catch (error) {
    throw pageError(page, error);
  }
}