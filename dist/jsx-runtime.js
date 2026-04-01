// src/jsx-runtime.ts
import * as tags from "javascript-to-html";
function flatten(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flatten(item));
  }
  return [value];
}
function normalizeChildren(children) {
  return flatten(children).filter((value) => value !== true);
}
function renderIntrinsicTag(tagName, props) {
  const tag = tags[tagName];
  if (typeof tag !== "function") {
    throw new Error(
      `[vite-plugin-html-pages] Unknown JSX tag: <${tagName}>`
    );
  }
  const { children, ...rest } = props;
  const normalizedChildren = normalizeChildren(children);
  if (Object.keys(rest).length > 0) {
    return tag(rest, ...normalizedChildren);
  }
  return tag(...normalizedChildren);
}
function Fragment(props) {
  return tags.fragment(...normalizeChildren(props.children));
}
function jsx(type, props) {
  const finalProps = props ?? {};
  if (typeof type === "function") {
    return type(finalProps);
  }
  return renderIntrinsicTag(type, finalProps);
}
var jsxs = jsx;
var jsxDEV = jsx;
export {
  Fragment,
  jsx,
  jsxDEV,
  jsxs
};
//# sourceMappingURL=jsx-runtime.js.map