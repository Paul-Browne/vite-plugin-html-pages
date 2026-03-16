import type { HtPageInfo } from './types';

function js(value: unknown): string {
  return JSON.stringify(value);
}

export function createManifestModule(entries: HtPageInfo[]): string {
  const imports = entries
    .map((page, i) => `import * as page${i} from ${js(page.entryPath)};`)
    .join('\n');

  const records = entries
    .map(
      (page, i) => `{
  page: ${js(page)},
  mod: page${i}
}`,
    )
    .join(',\n');

  return `${imports}

export const manifest = [
${records}
];
`;
}