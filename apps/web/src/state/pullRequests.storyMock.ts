/**
 * Storybook-only stand-in for this module, aliased onto `~/state/pullRequests` by
 * `t3team-storybook-main.ts` in the storybook build: the real module with its two read families
 * (`detail`, `activity`) resolved to the story fixtures instead of a live environment.
 *
 * This is the data seam stories use to mount the REAL `PullRequestDetailPanel` with realistic
 * sample data, per the storybook rule in AGENTS.md: mock the atom/RPC boundary, never re-create
 * the view. Everything else (command families, list, diff, helpers) stays the real module's:
 * the commands only run when pressed, and in the storybook there is no environment to reach.
 */
import type { PullRequestActivity, PullRequestDetail } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import * as real from "./pullRequests";
import {
  PR_ACTIVITY,
  PR_DETAIL,
} from "../t3team/stories/t3team-prDetailRecipeStoryData";

function resolved<T>(value: T): AsyncResult.AsyncResult<T, never> {
  return AsyncResult.success(value);
}

type StoryQueryTarget = { readonly environmentId: string; readonly input: unknown };

const detail: (target: StoryQueryTarget) => Atom.Atom<AsyncResult.AsyncResult<PullRequestDetail>> =
  Atom.family((target: StoryQueryTarget) => Atom.make(resolved(PR_DETAIL)));

const activity: (
  target: StoryQueryTarget,
) => Atom.Atom<AsyncResult.AsyncResult<PullRequestActivity>> = Atom.family((target: StoryQueryTarget) =>
  Atom.make(resolved(PR_ACTIVITY)),
);

export * from "./pullRequests";

export const pullRequestEnvironment = {
  ...real.pullRequestEnvironment,
  detail,
  activity,
};

export function usePullRequestTurnRefresh(): number | null {
  return null;
}
