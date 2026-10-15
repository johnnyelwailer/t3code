/**
 * Motion for the My Work digest's layout: when sections or rows are added, removed or move, the
 * browser animates them to their new places instead of snapping. It is the same view-transition
 * machinery the right sidebar uses (`runT3TeamViewTransition`); this file only decides when to
 * use it and names the parts that travel. Browsers without view transitions, and readers who
 * asked for reduced motion, get the plain update.
 */
import type { CSSProperties } from "react";

import { runT3TeamViewTransition } from "~/t3team/t3team-runViewTransition";

const DIGEST_TRANSITION_TYPE = "digest";

function viewTransitionsSupported(): boolean {
  return typeof globalThis.document?.startViewTransition === "function";
}

function reducedMotionRequested(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Applies `update` (one React commit), animated when the browser and the reader allow it. */
export function runDigestViewTransition(update: () => void): void {
  if (!viewTransitionsSupported() || reducedMotionRequested()) {
    update();
    return;
  }
  runT3TeamViewTransition(update, { types: [DIGEST_TRANSITION_TYPE] });
}

export type DigestTransitionPart = "section" | "story" | "standalone" | "row";

/** A CSS-safe name for one part; every character outside [A-Za-z0-9-] is spelled out in hex. */
export function digestViewTransitionName(part: DigestTransitionPart, id: string): string {
  const safe = [...id]
    .map((char) =>
      /[A-Za-z0-9-]/.test(char) ? char : `_${(char.codePointAt(0) ?? 0).toString(16)}_`,
    )
    .join("");
  return `t3-digest-${part}-${safe}`;
}

export function digestTransitionStyle(name: string | undefined): CSSProperties | undefined {
  return name === undefined ? undefined : { viewTransitionName: name };
}
