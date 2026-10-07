import type { T3TeamExplainer, T3TeamExplainerAskThread } from "./model/t3team-explainer";
import { findExplainerBlock, findExplainerStep } from "./t3team-explainerAnchor";
import { numberExplainerDiff } from "./t3team-explainerDiffLines";

/**
 * Whether a thread still points at something this explainer shows. A thread asked on another
 * revision, or on a step, block or line range that is gone, is outdated: it is listed apart and
 * folded, never dropped and never drawn against the wrong spot.
 */
export function isExplainerThreadOutdated(
  explainer: T3TeamExplainer,
  thread: T3TeamExplainerAskThread,
) {
  if (explainer.headSha !== undefined && thread.headSha !== explainer.headSha) return true;
  const step = findExplainerStep(explainer, thread.anchor.stepId)?.step;
  if (!step) return true;
  const target = thread.anchor.target;
  if (target.kind === "caption" || target.kind === "captionText") return false;
  const block = findExplainerBlock(step, target.blockId);
  if (!block) return true;
  if (target.kind === "diffLines") {
    return block.type !== "diff" || target.end > numberExplainerDiff(block).all.length;
  }
  return false;
}

export function partitionExplainerThreads(
  explainer: T3TeamExplainer,
  threads: ReadonlyArray<T3TeamExplainerAskThread>,
) {
  const current: T3TeamExplainerAskThread[] = [];
  const outdated: T3TeamExplainerAskThread[] = [];
  for (const thread of threads) {
    (isExplainerThreadOutdated(explainer, thread) ? outdated : current).push(thread);
  }
  return { current, outdated };
}
