/**
 * The model cascade (`{ models: [...] }` on `AskOpts` / `SpawnThreadOpts`) — author-side half.
 *
 * Availability is a HOST fact: only the server knows which provider instances are configured,
 * installed, and enabled right now. So the SDK does not probe anything — it fires ONE journaled
 * `model.resolve` primitive carrying the ladder, and the host answers with the winning
 * `ModelSelection` (or `null` when no rung is available) plus a human-readable reason.
 *
 * That round-trip is what makes the cascade replay-safe. The reply is a normal `resolved` journal
 * line, so a resume returns the RECORDED choice without re-firing the broker: the ask that
 * follows sees the same `model`, hence the same `argsHash`, even though the live registry may
 * have gained or lost providers in between. Authors who never pass `models` fire no
 * `model.resolve` at all — the journal stays byte-identical.
 *
 * The chosen rung is also `log()`ged, because silently switching which brain answered a step is
 * a debugging nightmare.
 */

import type { AskVerb } from "./t3team-sdk.askVerb.ts";
import type { MessageBroker } from "./t3team-sdk.broker.ts";
import type { HandleDispatch, ReplyResolver } from "./t3team-sdk.handles.ts";
import type { AskOpts, ModelCascade, ModelCascadeEntry } from "./t3team-sdk.threadTypes.ts";
import type { ModelSelection } from "./t3team-sdk.types.ts";

/** Wire form of one rung: plain strings only, so the payload (and its argsHash) is stable. */
export interface ModelCascadeWireEntry {
  readonly instanceId?: string;
  readonly model?: string;
}

const modelId = (model: ModelCascadeEntry["model"]): string | undefined =>
  model === undefined ? undefined : typeof model === "string" ? model : model.id;

/** Normalize the author's ladder to its wire form (typed `ModelRef` → its provider slug). */
export function toModelCascadeWire(cascade: ModelCascade): ReadonlyArray<ModelCascadeWireEntry> {
  return cascade.map((entry) => {
    const id = modelId(entry.model);
    return {
      ...(entry.instanceId === undefined ? {} : { instanceId: entry.instanceId }),
      ...(id === undefined ? {} : { model: id }),
    };
  });
}

/** The host's answer: the winning selection (absent when no rung was available) + why. */
interface ModelCascadeChoice {
  readonly selection: ModelSelection | undefined;
  readonly reason: string;
}

const asChoice = (reply: unknown): ModelCascadeChoice => {
  const record = (reply ?? {}) as { selection?: unknown; reason?: unknown };
  const selection = record.selection as ModelSelection | null | undefined;
  return {
    selection: selection ?? undefined,
    reason: typeof record.reason === "string" ? record.reason : "resolved by the host",
  };
};

/** Resolve a ladder to a concrete selection, or `undefined` to keep the run's default. */
export type ResolveModelCascade = (cascade: ModelCascade) => Promise<ModelSelection | undefined>;

export function createModelCascadeResolver(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly log: (message: string) => void;
}): ResolveModelCascade {
  return async (cascade) => {
    const payload = { entries: toModelCascadeWire(cascade) };
    const correlationId = await deps.dispatch.send({
      kind: "model.resolve",
      refId: "model.resolve",
      args: payload,
      fire: async (cid: string, resolver: ReplyResolver) => {
        let settled = false;
        const once: ReplyResolver = {
          resolve: (reply) => ((settled = true), resolver.resolve(reply)),
          reject: () => ((settled = true), resolver.reject()),
        };
        await deps.broker.send({ correlationId: cid, kind: "model.resolve", payload }, once);
        // A host with no cascade resolver must NOT park the run on a side effect nobody handles:
        // settle it as "nothing chosen" so the ask keeps the run's default selection.
        if (!settled) resolver.resolve({ selection: null, reason: "no host cascade resolver" });
      },
    });
    const choice = asChoice(await deps.dispatch.awaitResolution<unknown>(correlationId, undefined));
    deps.log(`model cascade: ${choice.reason}`);
    return choice.selection;
  };
}

/**
 * One thread's `askAgent`, cascade-aware. Precedence is explicit-first: a named `model` wins and
 * the ladder is never resolved. Otherwise the THREAD's ladder is resolved once and memoized (so
 * `agent()`'s create+turn, and every later ask on a `spawnThread`, share one journaled choice),
 * while an ask that names its OWN ladder resolves that one for itself. No rung available →
 * the ask goes out without a `model`, keeping the run's default selection.
 */
export function createThreadCascadeAsk(deps: {
  readonly askVerb: AskVerb;
  readonly resolve: ResolveModelCascade;
  readonly threadId: string;
  readonly threadLadder: ModelCascade | undefined;
}): <R>(prompt: string, opts: AskOpts<R>) => Promise<R> {
  let memo: Promise<ModelSelection | undefined> | undefined;
  return <R>(prompt: string, opts: AskOpts<R>): Promise<R> => {
    const ask = (o: AskOpts<R>) => deps.askVerb<R>("thread.turn", deps.threadId, prompt, o);
    if (opts.model !== undefined || opts.models === undefined) return ask(opts);
    const ladder = opts.models;
    const choice =
      ladder === deps.threadLadder ? (memo ??= deps.resolve(ladder)) : deps.resolve(ladder);
    return choice.then((model) => ask(model === undefined ? opts : { ...opts, model }));
  };
}
