import type {
  T3TeamExplainer,
  T3TeamExplainerAnchor,
  T3TeamExplainerBlock,
  T3TeamExplainerStep,
} from "./model/t3team-explainer";
import { numberExplainerDiff, type ExplainerNumberedLine } from "./t3team-explainerDiffLines";

/** Where in a step an anchor's thread is drawn: under the caption, or under one block. */
export type ExplainerAnchorSection = "caption" | `block:${string}`;

export function explainerAnchorSection(anchor: T3TeamExplainerAnchor): ExplainerAnchorSection {
  const target = anchor.target;
  return target.kind === "caption" || target.kind === "captionText"
    ? "caption"
    : `block:${target.blockId}`;
}

/** FNV-1a: a short stable fingerprint of the full quote. */
function hashQuote(quote: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < quote.length; index += 1) {
    hash ^= quote.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * One stable id per spot, so a second question on the same spot joins its thread. It names the
 * block and carries a hash of the whole quote, so two selections that start alike stay apart.
 */
export function explainerAnchorKey(anchor: T3TeamExplainerAnchor): string {
  const target = anchor.target;
  const spot = (() => {
    switch (target.kind) {
      case "caption":
      case "captionText":
        return target.kind;
      case "block":
        return `block:${target.blockId}${target.atSeconds === undefined ? "" : `@${Math.floor(target.atSeconds)}`}`;
      case "diffLines":
        return `lines:${target.blockId}:${target.start}-${target.end}`;
      case "mapNode":
        return `node:${target.blockId}:${target.nodeId}`;
      case "mapEdge":
        return `edge:${target.blockId}:${target.edgeId}`;
      case "blockText":
        return `text:${target.blockId}`;
    }
  })();
  return `${anchor.stepId}:${spot}:${hashQuote(anchor.quote)}`;
}

export function findExplainerStep(explainer: T3TeamExplainer, stepId: string) {
  const index = explainer.steps.findIndex((step) => step.id === stepId);
  return index < 0 ? null : { step: explainer.steps[index]!, index };
}

export function findExplainerBlock(step: T3TeamExplainerStep | undefined, blockId: string) {
  return step?.blocks.find((block) => block.id === blockId) ?? null;
}

/** The numbered lines a `diffLines` anchor covers, or none when its block is gone. */
export function explainerAnchorLines(
  block: T3TeamExplainerBlock | null,
  range: { readonly start: number; readonly end: number },
): ReadonlyArray<ExplainerNumberedLine> {
  if (block?.type !== "diff") return [];
  return numberExplainerDiff(block).all.slice(range.start, range.end);
}

function rangeLabel(lines: ReadonlyArray<ExplainerNumberedLine>) {
  const number = (entry: ExplainerNumberedLine | undefined) =>
    entry ? (entry.newLine ?? entry.oldLine) : null;
  const first = number(lines[0]);
  const last = number(lines.at(-1));
  if (first === null || last === null) return "lines";
  return first === last ? `L${first}` : `L${first} to L${last}`;
}

const fileName = (path: string) => path.split("/").at(-1) ?? path;

/** A short human name for the spot, as thread headers and the chat chip show it. */
export function describeExplainerAnchor(
  explainer: T3TeamExplainer,
  anchor: T3TeamExplainerAnchor,
): string {
  const found = findExplainerStep(explainer, anchor.stepId);
  if (!found) return "A removed step";
  const stepName = `Step ${found.index + 1}`;
  const target = anchor.target;
  if (target.kind === "caption") return stepName;
  if (target.kind === "captionText") return `${stepName} text`;
  const block = findExplainerBlock(found.step, target.blockId);
  switch (target.kind) {
    case "diffLines": {
      if (block?.type !== "diff") return `${stepName} diff`;
      return `${fileName(block.path)} ${rangeLabel(explainerAnchorLines(block, target))}`;
    }
    case "mapNode":
      return explainer.map?.nodes.find((node) => node.id === target.nodeId)?.label ?? "Map part";
    case "mapEdge": {
      const map = explainer.map;
      const edge = map?.edges.find((candidate) => candidate.id === target.edgeId);
      const label = (id: string | undefined) =>
        map?.nodes.find((node) => node.id === id)?.label ?? "?";
      return edge ? `${label(edge.from)} → ${label(edge.to)}` : "Map part";
    }
    case "block":
      if (target.atSeconds !== undefined) {
        const seconds = Math.floor(target.atSeconds);
        return `${stepName} video at ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      }
      return `${stepName} ${block?.type === "diff" ? fileName(block.path) : (block?.type ?? "part")}`;
    case "blockText":
      return block?.type === "diff" ? `${fileName(block.path)} text` : `${stepName} text`;
  }
}
