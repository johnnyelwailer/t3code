import type { AdfNode } from "./types.ts";

/**
 * Depth-first visitor over an ADF node tree. `visit` is called once per node,
 * parent before children, in document order. Does not visit into `marks` —
 * marks are attributes of a node, not child nodes.
 */
export function walkAdf(node: AdfNode, visit: (node: AdfNode) => void): void {
  visit(node);
  if (!node.content) return;
  for (const child of node.content) {
    walkAdf(child, visit);
  }
}

/** Every distinct `type` present anywhere in an ADF document (or subtree). */
export function collectAdfNodeTypes(doc: AdfNode): ReadonlySet<string> {
  const types = new Set<string>();
  walkAdf(doc, (node) => {
    types.add(node.type);
  });
  return types;
}

/**
 * Flattens an ADF document (or any node) to plain text: concatenates every
 * `text` leaf in document order. Used as the shared implementation behind
 * `extractTextFromADF` in `../normalize.ts` — keep the two in sync by editing
 * only this function.
 */
export function extractAdfText(doc: unknown): string {
  if (doc === null || doc === undefined) return "";
  if (typeof doc === "string") return doc;
  if (typeof doc !== "object") return "";

  const obj = doc as Record<string, unknown>;

  if (typeof obj.text === "string") {
    return obj.text;
  }

  if (Array.isArray(obj.content)) {
    return obj.content.map((child) => extractAdfText(child)).join("");
  }

  return "";
}
