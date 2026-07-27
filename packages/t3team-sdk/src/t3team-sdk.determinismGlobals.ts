/**
 * The unbound-nondeterministic-global table behind {@link ./t3team-sdk.determinismScan.ts}'s
 * `unjournaled-host-global` rule: host globals that are effectful or clock/entropy-reading AND
 * NOT bound in the workflow body context ({@link ./t3team-sdk.workflowGlobals.ts}), so a body
 * that reaches for one gets a `ReferenceError` at run time and has no journaled value to replay.
 *
 * Deliberately EXCLUDES `Date`, `Math`, and `crypto`: the engine binds deterministic, journaled
 * versions of those, and Epic 25 §Rules authors must follow, rule 1 is explicit that "ambient
 * nondeterminism is journaled, not banned".
 *
 * Each entry's value is the author-facing fix, quoted into the finding's message.
 */
export const UNJOURNALED_GLOBALS: ReadonlyMap<string, string> = new Map([
  ["setTimeout", "Use the durable `wait(ms)` primitive — it suspends across a server restart."],
  ["setInterval", "Use the durable `wait(ms)` primitive inside a loop."],
  ["setImmediate", "Use the durable `wait(ms)` primitive."],
  ["clearTimeout", "Timers belong to `wait(ms)`; there is nothing to clear in a workflow body."],
  ["clearInterval", "Timers belong to `wait(ms)`; there is nothing to clear in a workflow body."],
  ["queueMicrotask", "Schedule work with the composition primitives (`parallel`/`pipeline`)."],
  ["process", "Environment and process state are not replay-stable; read them in a `script`."],
  ["require", "Imports are types-only; move runtime dependencies into a `script` module."],
  ["fetch", "Network I/O belongs in a `script` module so its result is journaled."],
  ["XMLHttpRequest", "Network I/O belongs in a `script` module so its result is journaled."],
  ["WebSocket", "Long-lived connections belong in a `script` module."],
  ["performance", "Read the journaled clock via `now()` instead."],
  ["__dirname", "Filesystem paths are host state; resolve them inside a `script` module."],
  ["__filename", "Filesystem paths are host state; resolve them inside a `script` module."],
]);
