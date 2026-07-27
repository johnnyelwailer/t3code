import { adfAttrString, adfChildren, type AdfNode } from "./t3team-adfRendererTypes";

const DEFAULT_TEXT_BUDGET = 4_000;

/** Attrs that carry human-readable text on non-`text` nodes, in preference order. */
const TEXT_ATTR_KEYS = ["text", "shortName", "title", "alt", "name"] as const;

const INLINE_CONTAINER_TYPES = new Set(["paragraph", "heading", "text"]);

const BREAK_NODE: AdfNode = { type: "hardBreak" };

function ownText(node: AdfNode): string | undefined {
  if (typeof node.text === "string" && node.text.length > 0) return node.text;
  for (const key of TEXT_ATTR_KEYS) {
    const value = adfAttrString(node, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Flattens a node to its readable text, iteratively — no recursion, so a hostile or
 * pathologically deep document cannot blow the stack. Used for the depth-limit fallback
 * and for unknown leaf nodes; never emits raw JSON.
 *
 * Deliberately distinct from `extractAdfText` in `@t3tools/integrations-atlassian`: that one
 * is recursive (which would defeat this renderer's depth guard), reads only `text` leaves, and
 * has no budget. This one also surfaces attr-carried text (emoji, status, mention, media) and
 * separates block siblings, which is what a visual fallback needs.
 */
export function extractAdfPlainText(node: AdfNode, budget = DEFAULT_TEXT_BUDGET): string {
  const parts: string[] = [];
  let remaining = budget;
  const stack: AdfNode[] = [node];

  while (stack.length > 0 && remaining > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    const children = adfChildren(current);
    if (children.length > 0) {
      // Inline containers concatenate; block containers get a line break between children
      // so flattened paragraphs/list items do not run their words together.
      const separated = !INLINE_CONTAINER_TYPES.has(current.type);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child === undefined) continue;
        if (separated && index > 0) stack.push(child, BREAK_NODE);
        else stack.push(child);
      }
      continue;
    }
    if (current.type === "hardBreak") {
      parts.push("\n");
      continue;
    }
    const text = ownText(current);
    if (text === undefined) continue;
    const slice = text.slice(0, remaining);
    remaining -= slice.length;
    parts.push(slice);
  }

  return parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .trim();
}
