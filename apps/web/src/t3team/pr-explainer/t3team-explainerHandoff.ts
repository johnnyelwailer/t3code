import type { T3TeamExplainer, T3TeamExplainerAnchor } from "./model/t3team-explainer";
import { type PullRequestAgentSelectionInput } from "./t3team-explainerHostKit";
import {
  describeExplainerAnchor,
  explainerAnchorKey,
  explainerAnchorLines,
  findExplainerBlock,
  findExplainerStep,
} from "./t3team-explainerAnchor";
import { explainerHunkHeader } from "./t3team-explainerDiffLines";

const MARKER = { add: "+", delete: "-", context: " " } as const;

/** What "Open in Code" asks the host to show. `headSha` is set when the explainer is stale. */
export interface ExplainerOpenInCodeTarget {
  readonly path: string;
  readonly line: number;
  readonly side: "old" | "new";
  readonly headSha?: string;
}

/** The subject as a handoff names it: the PR panel's section id for a PR, else its title. */
export function explainerSubjectName(explainer: T3TeamExplainer) {
  const subject = explainer.subject;
  switch (subject.kind) {
    case "pr":
      return { id: `pull-request:${subject.number}`, title: `PR #${subject.number}` };
    case "branch":
      return { id: `branch:${subject.name}`, title: subject.title ?? subject.name };
    case "files":
    case "concept":
      return { id: `explainer:${subject.title}`, title: subject.title };
  }
}

/**
 * The anchor in the shape the PR panel's "Add selection to agent" handoff already takes, so a host
 * can pass its existing `addSelectionToAgent` straight through. `staleSha` names the older commit
 * the explainer was written against, so the agent knows the lines may have moved.
 */
export function buildExplainerAgentSelection(input: {
  readonly explainer: T3TeamExplainer;
  readonly anchor: T3TeamExplainerAnchor;
  readonly request: string;
  readonly staleSha?: string | undefined;
}): PullRequestAgentSelectionInput {
  const { explainer, anchor } = input;
  const step = findExplainerStep(explainer, anchor.stepId)?.step;
  const target = anchor.target;
  const block =
    target.kind === "caption" || target.kind === "captionText"
      ? null
      : findExplainerBlock(step, target.blockId);
  const lines = target.kind === "diffLines" ? explainerAnchorLines(block, target) : [];
  const subject = explainerSubjectName(explainer);
  const firstDiff = step?.blocks.find((candidate) => candidate.type === "diff");
  const context = step ? `Explainer step: ${step.caption}` : "";
  const stale = input.staleSha
    ? ` (written at ${input.staleSha.slice(0, 7)}, an older commit)`
    : "";
  return {
    request: input.request,
    comment: {
      id: `explainer:${subject.id}:${explainerAnchorKey(anchor)}`,
      sectionId: subject.id,
      sectionTitle: `${subject.title} explainer${stale}`,
      filePath:
        block?.type === "diff"
          ? block.path
          : firstDiff?.type === "diff"
            ? firstDiff.path
            : subject.title,
      startIndex: target.kind === "diffLines" ? target.start : 0,
      endIndex: target.kind === "diffLines" ? Math.max(target.start, target.end - 1) : 0,
      rangeLabel: describeExplainerAnchor(explainer, anchor),
      text: "",
      diff:
        lines.length > 0
          ? [
              explainerHunkHeader(lines),
              ...lines.map((entry) => `${MARKER[entry.line.kind]}${entry.line.content}`),
            ].join("\n")
          : [context, anchor.quote].filter(Boolean).join("\n"),
      fenceLanguage: lines.length > 0 ? "diff" : "text",
    },
  };
}
