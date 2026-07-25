/**
 * The harness's REAL `scripts.*` invocation log.
 *
 * `scriptCalls` used to be `recipe.scriptNames` — the DECLARED registrations — so an E2E
 * assertion on it proved wiring, never execution. It is now derived from the run's durable
 * journal instead: every `scripts.*` dispatch funnels through `callScript`
 * (`t3work-sdk.toolScriptCalls.ts`) and journals a `script` / `script-never` primitive entry
 * keyed by `seq`. Reading that recorded truth back needs no instrumentation and no
 * side-channel, and it survives a resume (the replayed prefix is in the journal too).
 *
 * A declared-but-never-dispatched script now shows up in {@link T3workHarnessScriptLog.uncalledScripts},
 * which the E2E runner treats as a failure — a recipe cannot claim a script it does not call.
 */
import type { JournalStore } from "@t3work/sdk";

export type T3workHarnessScriptLog = {
  /** Every `scripts.*` dispatch the run actually journaled, in call (`seq`) order. Repeats are
   * kept, so a caller sees both the count and the order, not just the distinct set. */
  readonly scriptCalls: ReadonlyArray<string>;
  /** The names the recipe registered under `scripts` (deduplicated, sorted). */
  readonly declaredScripts: ReadonlyArray<string>;
  /** Declared but never dispatched — the recipe over-claims. Non-empty fails the E2E gate. */
  readonly uncalledScripts: ReadonlyArray<string>;
};

/** The journal `kind`s a `scripts.*` dispatch records (`script-never` is the replay:"never" marker). */
const SCRIPT_KINDS: ReadonlySet<string> = new Set(["script", "script-never"]);

/** Derive the invocation log from the recorded journal, then diff it against the declarations. */
export function buildT3workHarnessScriptLog(input: {
  readonly entries: ReadonlyArray<{
    readonly seq: number;
    readonly kind: string;
    readonly refId: string;
  }>;
  readonly declaredScripts: ReadonlyArray<string>;
}): T3workHarnessScriptLog {
  const scriptCalls = [...input.entries]
    .toSorted((left, right) => left.seq - right.seq)
    .filter((entry) => SCRIPT_KINDS.has(entry.kind))
    .map((entry) => entry.refId);
  const declaredScripts = [...new Set(input.declaredScripts)].toSorted();
  const called = new Set(scriptCalls);
  return {
    scriptCalls,
    declaredScripts,
    uncalledScripts: declaredScripts.filter((name) => !called.has(name)),
  };
}

/** Read the run's journal through the same {@link JournalStore} the launch wrote it with. */
export async function readT3workHarnessScriptLog(input: {
  readonly store: JournalStore;
  readonly runId: string;
  readonly declaredScripts: ReadonlyArray<string>;
}): Promise<T3workHarnessScriptLog> {
  const maps = await input.store.readEntries(input.runId);
  return buildT3workHarnessScriptLog({
    entries: [...maps.bySeq.values()],
    declaredScripts: input.declaredScripts,
  });
}
