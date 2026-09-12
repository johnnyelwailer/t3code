// Keep recent thread snapshots for back navigation, so a returning route can
// render immediately instead of re-downloading the thread body.
export const THREAD_SNAPSHOT_IDLE_TTL_MS = 5 * 60_000;

// Mobile thread routes unmount during back navigation, and a desktop render pass
// driven by a live event can drop a thread's consumer count to zero for a frame.
// Retain the stream-backed state across those short subscriber gaps without
// keeping every opened thread alive.
//
// `Atom.setIdleTTL(0)` (upstream #9740) removed the gap tolerance entirely: the
// registry's `removeNode` skips `setNodeTimeout` when `idleTTL === 0` and calls
// `node.remove()` inline, so every blip interrupts the `subscribeThread` stream
// and re-opens it, at the cost of three SQL reads and a fresh coalescer each
// time. This node also owns the older-page worker and its request registration,
// so the retention window delays that cleanup too (see threads.ts).
//
// SIZING. Measured on a live install: 1074 consecutive cycles of "subscription
// aborted -> next subscription opened", by how long the gap between them was.
// A TTL of X absorbs a cycle whose gap is <= X:
//
//     250ms 64.0%   500ms 69.4%   1s 78.9%   2s 91.1%
//     3s 95.2%      4s 96.8%      5s 98.1%   8s 99.5%
//
// 5s is where the curve flattens: 8s buys 1.4 points while holding
// genuinely-closed streams open longer. Two caveats on that table, both real:
// the gap is measured server-side between RPC spans, which bounds the atom's
// idle interval from above rather than measuring it directly; and the registry
// rounds expiry into the next `timeoutResolution` bucket (default 1000ms, and
// the web app constructs its registry with no options), so the effective window
// is 5-6s, not exactly 5s.
export const THREAD_STATE_IDLE_TTL_MS = 5_000;
