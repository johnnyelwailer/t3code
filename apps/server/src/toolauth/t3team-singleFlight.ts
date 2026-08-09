/**
 * Single-flight claims, keyed by tool.
 *
 * Both flows in this directory had the same time-of-check/time-of-use race:
 * read the session map, discover no active flow, then spawn a process and write
 * the map. Spawning suspends, so two concurrent callers for the same tool both
 * passed the check, both spawned, and the second overwrote the first's entry —
 * leaving an orphaned process running (a package manager against the same global
 * prefix, or a second CLI login pty) with nothing tracking it.
 *
 * The claim is deliberately a plain `Set` and deliberately synchronous. `has`
 * followed by `add` with no `await`/`yield*` between them cannot be interleaved
 * by another fiber, which is exactly the guarantee reading a `SynchronizedRef`
 * could NOT give: that read is itself a suspension point, so it reopens the very
 * window it looks like it closes.
 *
 * Call sites pair `claim` with `release` via `Effect.ensuring`, so the claim is
 * dropped even if the spawn fails. It only has to cover the gap until the
 * session map owns the process; after that the session's own phase is the guard.
 *
 * @module toolauth/singleFlight
 */

export interface ToolSingleFlight {
  /** True when another caller holds the claim for this tool. */
  readonly isClaimed: (tool: string) => boolean;
  /**
   * Takes the claim. MUST be called with no suspension between the `isClaimed`
   * check and this call, or the race is back.
   */
  readonly claim: (tool: string) => void;
  readonly release: (tool: string) => void;
}

export function makeToolSingleFlight(): ToolSingleFlight {
  const inFlight = new Set<string>();
  return {
    isClaimed: (tool) => inFlight.has(tool),
    claim: (tool) => {
      inFlight.add(tool);
    },
    release: (tool) => {
      inFlight.delete(tool);
    },
  };
}
