import path from 'node:path';

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function stripHtSuffix(file: string): string {
  return file.replace(/\.ht\.js$/i, '');
}

export function normalizeRoutePath(p: string): string {
  let out = p.startsWith('/') ? p : `/${p}`;
  out = out.replace(/\/+/g, '/');
  if (out !== '/' && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

export function normalizeFsPath(p: string): string {
  return toPosix(path.resolve(p));
}