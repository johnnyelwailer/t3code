import type {
  T3TeamPrExplainer,
  T3TeamPrExplainerAnchor,
  T3TeamPrExplainerDiffLine,
  T3TeamPrExplainerDiffSlice,
} from "@t3tools/contracts";

import type { PullRequestAgentSelectionInput } from "~/components/pullRequest/PullRequestCodeTab";

/** Where in a step an anchor's thread is drawn: under the caption, a diff slice, or the visual. */
export type PrExplainerAnchorSection = "caption" | `diff:${string}` | "visual";

export function prExplainerAnchorSection(
  anchor: T3TeamPrExplainerAnchor,
): PrExplainerAnchorSection {
  const target = anchor.target;
  switch (target.kind) {
    case "caption":
      return "caption";
    case "diffLine":
      return `diff:${target.sliceId}`;
    case "textSelection":
      if (target.within === "diff" && target.sliceId) return `diff:${target.sliceId}`;
      return target.within === "caption" ? "caption" : "visual";
    default:
      return "visual";
  }
}

/** One stable id per spot, so a second question on the same spot joins its thread. */
export function prExplainerAnchorKey(anchor: T3TeamPrExplainerAnchor): string {
  const target = anchor.target;
  switch (target.kind) {
    case "diffLine":
      return `${anchor.stepId}:diff:${target.sliceId}:${target.start}-${target.end}`;
    case "mapNode":
      return `${anchor.stepId}:node:${target.nodeId}`;
    case "mapEdge":
      return `${anchor.stepId}:edge:${target.edgeId}`;
    case "textSelection":
      return `${anchor.stepId}:text:${target.within}:${anchor.quote.slice(0, 40)}`;
    default:
      return `${anchor.stepId}:${target.kind}`;
  }
}

/** Every line a slice can show, in order: context before, the slice, context after. */
export function prExplainerSliceLines(slice: T3TeamPrExplainerDiffSlice) {
  const before = slice.before ?? [];
  return {
    all: [...before, ...slice.lines, ...(slice.after ?? [])],
    focusStart: before.length,
    focusEnd: before.length + slice.lines.length - 1,
  };
}

const MARKER = { add: "+", delete: "-", context: " " } as const;

function hunkHeader(lines: ReadonlyArray<T3TeamPrExplainerDiffLine>) {
  const olds = lines.flatMap((line) => (line.oldLine === null ? [] : [line.oldLine]));
  const news = lines.flatMap((line) => (line.newLine === null ? [] : [line.newLine]));
  return `@@ -${olds[0] ?? 0},${olds.length} +${news[0] ?? 0},${news.length} @@`;
}

function lineNumber(line: T3TeamPrExplainerDiffLine) {
  return line.newLine ?? line.oldLine;
}

function rangeLabel(lines: ReadonlyArray<T3TeamPrExplainerDiffLine>) {
  const first = lines[0] ? lineNumber(lines[0]) : null;
  const last = lines.at(-1) ? lineNumber(lines.at(-1)!) : null;
  if (first === null || last === null) return "line";
  return first === last ? `L${first}` : `L${first} to L${last}`;
}

/** A short human name for the spot, as the thread header and the chat chip show it. */
export function describePrExplainerAnchor(
  explainer: T3TeamPrExplainer,
  anchor: T3TeamPrExplainerAnchor,
): string {
  const target = anchor.target;
  const step = explainer.steps.find((candidate) => candidate.id === anchor.stepId);
  const stepNumber = step ? explainer.steps.indexOf(step) + 1 : "?";
  switch (target.kind) {
    case "diffLine": {
      const slice = step?.diffs.find((candidate) => candidate.id === target.sliceId);
      if (!slice) return `Step ${stepNumber} diff`;
      const lines = prExplainerSliceLines(slice).all.slice(target.start, target.end + 1);
      return `${slice.path.split("/").at(-1)} ${rangeLabel(lines)}`;
    }
    case "mapNode":
      return explainer.map?.nodes.find((node) => node.id === target.nodeId)?.label ?? "Map node";
    case "mapEdge": {
      const map = explainer.map;
      const edge = map?.edges.find((candidate) => candidate.id === target.edgeId);
      const label = (id: string | undefined) =>
        map?.nodes.find((node) => node.id === id)?.label ?? "?";
      return edge ? `${label(edge.from)} → ${label(edge.to)}` : "Map edge";
    }
    case "caption":
      return `Step ${stepNumber}`;
    case "visual":
      return `Step ${stepNumber} visual`;
    case "textSelection":
      return `Step ${stepNumber} text`;
  }
}

/**
 * The anchor in the shape the PR panel's "Add selection to agent" handoff already takes, so the
 * panel can pass its existing `addSelectionToAgent` straight through.
 */
export function buildPrExplainerAgentSelection(input: {
  readonly explainer: T3TeamPrExplainer;
  readonly anchor: T3TeamPrExplainerAnchor;
  readonly request: string;
}): PullRequestAgentSelectionInput {
  const { explainer, anchor } = input;
  const step = explainer.steps.find((candidate) => candidate.id === anchor.stepId);
  const target = anchor.target;
  const slice =
    target.kind === "diffLine"
      ? step?.diffs.find((candidate) => candidate.id === target.sliceId)
      : undefined;
  const lines =
    slice && target.kind === "diffLine"
      ? prExplainerSliceLines(slice).all.slice(target.start, target.end + 1)
      : [];
  const number = explainer.pullRequest.number;
  const context = step ? `Explainer step: ${step.caption}` : "";
  return {
    request: input.request,
    comment: {
      id: `pr-explainer:${number}:${prExplainerAnchorKey(anchor)}`,
      sectionId: `pull-request:${number}`,
      sectionTitle: `PR #${number} explainer`,
      filePath: slice?.path ?? step?.diffs[0]?.path ?? `PR #${number}`,
      startIndex: target.kind === "diffLine" ? target.start : 0,
      endIndex: target.kind === "diffLine" ? target.end : 0,
      rangeLabel: describePrExplainerAnchor(explainer, anchor),
      text: "",
      diff:
        lines.length > 0
          ? [hunkHeader(lines), ...lines.map((line) => `${MARKER[line.kind]}${line.content}`)].join(
              "\n",
            )
          : [context, anchor.quote].filter(Boolean).join("\n"),
      fenceLanguage: lines.length > 0 ? "diff" : "text",
    },
  };
}
