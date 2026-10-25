// Keep recent thread snapshots for back navigation, so a returning route can
// render immediately instead of re-downloading the thread body.
export const THREAD_SNAPSHOT_IDLE_TTL_MS = 5 * 60_000;

// Retain stream-backed state across short subscriber gaps (mobile back navigation, a render pass dropping
// the consumer count to zero for a frame); `Atom.setIdleTTL(0)` made every blip reopen `subscribeThread`, and
// also delays older-page worker cleanup (threads.ts). 5s absorbs 98% of 1074 measured gaps (8s adds 1.4 points);
// expiry rounds up to the registry's 1s bucket, so the window is 5-6s. Churn fix only, not proven to explain the 50+ GB memory incident.
export const THREAD_STATE_IDLE_TTL_MS = 5_000;
