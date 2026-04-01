export type PrimitiveChild = string | number | boolean | null | undefined;
export type Child = PrimitiveChild | Child[];

export type Props = Record<string, unknown> & {
  children?: unknown;
};

export declare function Fragment(props: Props): string;

export declare function jsx(
  type: string | ((props: Props) => unknown),
  props: Props | null,
): unknown;

export declare const jsxs: typeof jsx;
export declare const jsxDEV: typeof jsx;

export namespace JSX {
  type Element = string;

  interface ElementChildrenAttribute {
    children: {};
  }

  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
}