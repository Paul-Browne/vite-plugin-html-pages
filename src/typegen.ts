import fs from 'node:fs/promises';
import path from 'node:path';

import type { HtPageInfo, RouteParamDefinition } from './types';
import { normalizeFsPath, toPosix } from './path-utils';

function paramsTypeFromDefinitions(
  paramDefinitions: RouteParamDefinition[],
): string {
  if (paramDefinitions.length === 0) {
    return '{}';
  }

  const fields = paramDefinitions.map((param) => {
    if (param.type === 'single') {
        return `${param.name}: string`;
    }

    if (param.type === 'catch-all') {
        return `${param.name}: string[]`;
    }

    return `${param.name}?: string[]`;
  });

  return `{ ${fields.join('; ')} }`;
}

function pageHelperModuleSource(page: HtPageInfo): string {
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

export type PageModule<TData = unknown> = {
  generateStaticParams?: () => StaticParams | Promise<StaticParams>;
  data?: (ctx: DataContext) => TData | Promise<TData>;
  render: (ctx: RenderContext<TData>) => string | Promise<string>;
};

export declare function definePage<
  T extends (ctx: PageContext) => string | Promise<string>
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

function stripPageExtension(filePath: string): string {
  return filePath.replace(/\.(ht|html)\.(js|ts|jsx|tsx)$/i, '');
}

function getTypesFileName(page: HtPageInfo): string {
  if (!page.dynamic || page.paramDefinitions.length === 0) {
    return '$types.d.ts';
  }

  const parts = page.paramDefinitions.map((param) => {
    if (param.type === 'single') {
      return param.name;
    }

    if (param.type === 'catch-all') {
      return `${param.name}.all`;
    }

    return `${param.name}.opt`;
  });

  return `$types.${parts.join('.')}.d.ts`;
}

export function getGeneratedTypesRoot(root: string): string {
  return normalizeFsPath(path.join(root, '.vite-plugin-html-pages', 'types'));
}

export function getGeneratedHelperPath(args: {
  root: string;
  pagesDir: string;
  page: HtPageInfo;
}): string {
  const pagesRoot = normalizeFsPath(path.join(args.root, args.pagesDir));
  const relativeFromPagesDir = toPosix(
    path.relative(pagesRoot, args.page.absolutePath),
  );
  const withoutExt = stripPageExtension(relativeFromPagesDir);
  const outRoot = getGeneratedTypesRoot(args.root);
  const fileName = getTypesFileName(args.page);

  return normalizeFsPath(
    path.join(outRoot, path.dirname(withoutExt), fileName),
  );
}

export async function writePageTypeDeclarations(args: {
  root: string;
  pagesDir: string;
  entries: HtPageInfo[];
}): Promise<void> {
  const outRoot = getGeneratedTypesRoot(args.root);

  await fs.mkdir(outRoot, { recursive: true });

  await Promise.all(
    args.entries.map(async (page) => {
      const outFile = getGeneratedHelperPath({
        root: args.root,
        pagesDir: args.pagesDir,
        page,
      });

      await fs.mkdir(path.dirname(outFile), { recursive: true });
      await fs.writeFile(outFile, pageHelperModuleSource(page), 'utf8');
    }),
  );
}