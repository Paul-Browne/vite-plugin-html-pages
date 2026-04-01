type PrimitiveChild = string | number | boolean | null | undefined;
type Child = PrimitiveChild | Child[];

type Props = Record<string, unknown> & {
  children?: unknown;
};

declare function Fragment(props: Props): string;

declare function jsx(
  type: string | ((props: Props) => unknown),
  props: Props | null,
): unknown;

declare const jsxs: typeof jsx;
declare const jsxDEV: typeof jsx;

declare namespace JSX {
  type Element = string;

  interface ElementChildrenAttribute {
    children: {};
  }

  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
}

export { type Child, Fragment, JSX, type PrimitiveChild, type Props, jsx, jsxDEV, jsxs };
