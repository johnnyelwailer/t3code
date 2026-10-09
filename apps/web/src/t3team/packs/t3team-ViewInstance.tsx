/**
 * One rendered view of any slot: the pack scope it acts in and its own error boundary, so a
 * crashing view replaces itself with `fallback` and never takes down the panel, the digest or the
 * timeline around it. Every slot renders each registration through this, one boundary per
 * instance, so one bad view cannot hide a sibling.
 */
import type { ReactNode } from "react";

import { RenderErrorBoundary } from "~/components/RenderErrorBoundary";

import { PackScopeContext } from "./t3team-packScope";
import type { ViewOwner } from "./t3team-viewRegistry";

export function ViewInstance({
  owner,
  fallback,
  resetKeys,
  children,
}: {
  readonly owner: ViewOwner;
  /** Shown instead of the view once it has thrown; `null` for a slot too small for a notice. */
  readonly fallback: ReactNode;
  /** The boundary retries when one of these changes, not on every parent render. */
  readonly resetKeys: ReadonlyArray<unknown>;
  readonly children: ReactNode;
}) {
  const boundary = (
    <RenderErrorBoundary resetKeys={resetKeys} fallback={fallback}>
      {children}
    </RenderErrorBoundary>
  );
  return owner.kind === "pack" ? (
    <PackScopeContext.Provider value={owner.packId}>{boundary}</PackScopeContext.Provider>
  ) : (
    boundary
  );
}
