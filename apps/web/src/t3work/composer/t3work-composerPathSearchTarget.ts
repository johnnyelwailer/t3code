import type { EnvironmentId } from "@t3tools/contracts";

import type { ComposerTrigger } from "~/composer-logic";

export type T3workComposerPathSearchScope = {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
};

export type T3workComposerPathSearchTarget = {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
  readonly query: string | null;
};

/**
 * Builds the `projects.searchEntries` target for the composer's `@` trigger.
 *
 * Mirrors the chat composer's inline call (ChatComposer.tsx `workspaceEntries`):
 * the environment is always supplied so the query atom keeps its identity, while
 * `cwd`/`query` are only filled for a live path trigger. The underlying query is
 * disabled unless all three are present, so a missing scope silently produces an
 * empty menu — which is exactly how the kickoff `@` menu used to fail. Keeping
 * this resolution pure makes that gate assertable in tests.
 */
export function resolveT3workComposerPathSearchTarget(
  trigger: ComposerTrigger | null,
  scope: T3workComposerPathSearchScope | null,
): T3workComposerPathSearchTarget {
  const isPathTrigger = trigger?.kind === "path";
  return {
    environmentId: scope?.environmentId ?? null,
    cwd: isPathTrigger ? (scope?.cwd ?? null) : null,
    query: isPathTrigger ? trigger.query : null,
  };
}

/** True when the resolved target will actually issue a file-search request. */
export function isT3workComposerPathSearchTargetQueryable(
  target: T3workComposerPathSearchTarget,
): boolean {
  return (
    target.environmentId !== null &&
    target.cwd !== null &&
    target.cwd.trim().length > 0 &&
    (target.query ?? "").trim().length > 0
  );
}
