import type { T3TeamExplainerAnchor } from "./model/t3team-explainer";

/**
 * Text the reader can select and ask about is marked `data-xp-text`: "caption", or "block" with
 * `data-xp-block`. Thread answers are marked `data-xp-thread` and never count.
 */
function regionOf(node: Node | null) {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  if (!element || element.closest("[data-xp-thread]")) return null;
  return element.closest<HTMLElement>("[data-xp-text]");
}

/** The selection, if it starts and ends inside one askable text region of `root`. */
export function readExplainerSelection(root: HTMLElement, stepId: string) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const quote = selection.toString().trim();
  if (quote.length === 0) return null;
  const range = selection.getRangeAt(0);
  const start = regionOf(range.startContainer);
  if (!start || start !== regionOf(range.endContainer) || !root.contains(start)) return null;
  const blockId = start.dataset.xpBlock;
  const target: T3TeamExplainerAnchor["target"] =
    start.dataset.xpText === "block" && blockId
      ? { kind: "blockText", blockId }
      : { kind: "captionText" };
  const anchor: T3TeamExplainerAnchor = { stepId, target, quote: quote.slice(0, 2000) };
  return { anchor, rect: range.getBoundingClientRect() };
}
