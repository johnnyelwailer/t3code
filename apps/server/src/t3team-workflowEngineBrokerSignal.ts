/**
 * The broker's signal-source verbs (GHE #332, design 42): `signal.register` and `signal.wait`.
 *
 * `signal.register` is one-way — it durably upserts the run × source-instance binding FACT and
 * pokes the reconciler so a newly-bound instance starts promptly. It never settles a resolver.
 *
 * `signal.wait` is ask-shaped: the run parks until the delivery port resolves its correlation
 * with the awaited `(signal, key)` payload. Two outcomes:
 *   • LIVE DRAIN — a durable inbox entry already matches this tuple (the event landed while no
 *     run was parked on it). The entry is settled SYNCHRONOUSLY, exactly like `model.resolve`:
 *     the payload becomes this primitive's `resolved` journal line, so a replay reuses the
 *     recorded reply instead of re-draining the inbox.
 *   • PARK — nothing is open. The run records `watching` (status + the awaited `(signal, key)` +
 *     correlation) and suspends out of band, mirroring the `wait.until` clock park: no resolver
 *     settle, no orchestration command (an event has no message) — the delivery port appends the
 *     resolved entry when the source fires.
 */
import type { BrokerCore, BrokerSend } from "./t3team-workflowEngineBrokerContext.ts";
import type { SignalRegisterPayload, SignalWaitPayload } from "./t3team-workflowEngineBrokerTypes.ts";

export async function handleBrokerSignalVerb(core: BrokerCore, s: BrokerSend): Promise<boolean> {
  const { correlationId, kind, payload } = s;
  if (kind === "signal.register") {
    const p = payload as SignalRegisterPayload;
    core.step(correlationId, kind, "waiting", `Watch source ${p.source}`);
    await core.runPrimitive(async () => {
      await core.deps.recordSignalRegistration?.(p);
    });
    return true;
  }
  if (kind === "signal.wait") {
    const p = payload as SignalWaitPayload;
    const drained = await core.deps.drainSignalWait?.(p);
    if (drained !== undefined) {
      // Live drain: an open inbox entry matched this exact tuple. Settle synchronously with its
      // payload — the reply is journaled, so a replay never drains the inbox a second time.
      core.step(correlationId, kind, "completed", `Signal ${p.signal} — key ${p.key}`);
      s.resolver.resolve(drained);
      return true;
    }
    // Park on the event: record the watched `(signal, key)` + correlation, then suspend out of
    // band until the delivery port (or a boot rehydration + delivery) resolves it.
    core.step(correlationId, kind, "waiting", `Watch ${p.signal} — key ${p.key}`);
    await core.runPrimitive(async () => {
      await core.deps.recordWatching?.({
        correlationId,
        sourceName: p.source,
        paramsHash: p.paramsHash,
        watchSignalName: p.signal,
        watchSignalKey: p.key,
      });
    });
    return true;
  }
  return false;
}
