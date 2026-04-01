import path from 'node:path';

export function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

export function normalizeFsPath(value: string): string {
  return path.normalize(value);
}

export function normalizeRoutePath(value: string): string {
  const normalized = toPosix(value).replace(/\/+/g, '/');
  if (!normalized || normalized === '/') return '/';

  const withLeadingSlash = normalized.startsWith('/')
    ? normalized
    : `/${normalized}`;

  return withLeadingSlash !== '/' && withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

export function stripPageSuffix(
  filePath: string,
  extensions: string[],
): string {
  const normalized = toPosix(filePath);

  const match = [...extensions]
    .sort((a, b) => b.length - a.length)
    .find((ext) => normalized.endsWith(ext));

  if (!match) return normalized;

  return normalized.slice(0, -match.length);
}