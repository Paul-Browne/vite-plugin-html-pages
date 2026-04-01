import * as tags from 'javascript-to-html';

type PrimitiveChild = string | number | boolean | null | undefined;
type Child = PrimitiveChild | Child[];

function flatten(value: Child): PrimitiveChild[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flatten(item));
  }

  return [value];
}

function normalizeChildren(children: unknown): PrimitiveChild[] {
  return flatten(children as Child).filter((value) => value !== true);
}

type Props = Record<string, unknown> & {
  children?: unknown;
};

type Component = (props: Props) => unknown;

function renderIntrinsicTag(tagName: string, props: Props): string {
  const tag = (tags as Record<string, (...args: unknown[]) => string>)[tagName];

  if (typeof tag !== 'function') {
    throw new Error(
      `[vite-plugin-html-pages] Unknown JSX tag: <${tagName}>`,
    );
  }

  const { children, ...rest } = props;
  const normalizedChildren = normalizeChildren(children);

  if (Object.keys(rest).length > 0) {
    return tag(rest, ...normalizedChildren);
  }

  return tag(...normalizedChildren);
}

export function Fragment(props: Props): string {
  return tags.fragment(...normalizeChildren(props.children));
}

export function jsx(
  type: string | Component,
  props: Props | null,
): unknown {
  const finalProps = props ?? {};

  if (typeof type === 'function') {
    return type(finalProps);
  }

  return renderIntrinsicTag(type, finalProps);
}

export const jsxs = jsx;
export const jsxDEV = jsx;