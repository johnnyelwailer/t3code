// Keep recent thread snapshots for back navigation. Live subscriptions end
// when the last detail consumer leaves.
export const THREAD_SNAPSHOT_IDLE_TTL_MS = 5 * 60_000;

// Mobile thread routes unmount during back navigation, and a desktop render pass
// driven by a live event can drop a thread's consumer count to zero for a frame.
// Retain the stream-backed state across those short subscriber gaps without
// keeping every opened thread alive.
//
// `Atom.setIdleTTL(0)` (upstream #9740) removed the gap tolerance entirely: the
// registry's `removeNode` skips `setNodeTimeout` when `idleTTL === 0` and calls
// `node.remove()` inline, so every blip interrupted the `subscribeThread` stream
// and re-opened it — 1.35 resubscribes per persisted domain event on a live
// install, each costing three SQL reads plus a fresh coalescer and live budget.
//
// Sized from the measured gap distribution (1074 teardown -> resubscribe cycles
// on the live app): p50 812ms, p90 2.9s, p95 4.4s. 5s absorbs 98.1% of cycles;
// 2s absorbs only 91.1%. Beyond 5s the curve flattens (8s buys 1.4 points) while
// genuinely-closed threads would hold their stream open longer for no gain.
export const THREAD_STATE_IDLE_TTL_MS = 5_000;
