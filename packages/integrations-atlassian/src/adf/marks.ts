import { assertHex6, type AdfNode } from "./types.ts";

export type MarkKind =
  | "strong"
  | "em"
  | "code"
  | "strike"
  | "underline"
  | "textColor"
  | "backgroundColor"
  | "subsup"
  | "link";

export interface MarkSpec {
  strong?: boolean;
  em?: boolean;
  code?: boolean;
  strike?: boolean;
  underline?: boolean;
  textColor?: string;
  backgroundColor?: string;
  subsup?: "sup" | "sub";
  link?: string;
}

/**
 * Builds a text node with marks, enforcing the documented mark-combination
 * rules: `code` may only combine with `link`; `textColor`/`backgroundColor`
 * cannot combine with `code`; `textColor` cannot combine with `link`.
 * Empty text is rejected (never emit an invalid empty text node — call sites
 * should skip instead).
 */
export function text(value: string, spec: MarkSpec = {}): AdfNode {
  if (value === "") {
    throw new TypeError('text() requires a non-empty string; skip the node instead of passing ""');
  }
  const marks: Array<Record<string, unknown>> = [];
  if (spec.code) marks.push({ type: "code" });
  if (spec.link !== undefined) marks.push({ type: "link", attrs: { href: spec.link } });
  if (spec.strong) marks.push({ type: "strong" });
  if (spec.em) marks.push({ type: "em" });
  if (spec.strike) marks.push({ type: "strike" });
  if (spec.underline) marks.push({ type: "underline" });
  if (spec.subsup) marks.push({ type: "subsup", attrs: { type: spec.subsup } });
  if (spec.textColor !== undefined) {
    if (spec.code) throw new TypeError("textColor mark cannot combine with code");
    if (spec.link !== undefined) throw new TypeError("textColor mark cannot combine with link");
    assertHex6(spec.textColor, "textColor");
    marks.push({ type: "textColor", attrs: { color: spec.textColor } });
  }
  if (spec.backgroundColor !== undefined) {
    if (spec.code) throw new TypeError("backgroundColor mark cannot combine with code");
    assertHex6(spec.backgroundColor, "backgroundColor");
    marks.push({ type: "backgroundColor", attrs: { color: spec.backgroundColor } });
  }
  return marks.length > 0 ? { type: "text", text: value, marks } : { type: "text", text: value };
}
