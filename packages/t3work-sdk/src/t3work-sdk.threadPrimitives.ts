/**
 * The Thread model (Epic 25 §The thread model) — the author-facing globals `thread`,
 * `spawnThread`, and `agent`, plus the `Thread` interface they hand back. An interactive
 * conversation IS the Handle pattern: every verb reduces to a `sent`/`resolved` pair routed
 * through {@link HandleDispatch}, so there is no separate suspension machinery.
 *
 * The 2×2 surface is recipient (Agent / User) × mode (ask = drive + await a typed reply /
 * notify = fire-and-forget): `askAgent`→`thread.turn`, `notifyAgent`→`thread.message`,
 * `askUser`→`user.input`, `notifyUser`→`thread.message`. `spawnThread`→`thread.create` makes
 * an isolated thread whose id is the `thread.create` correlationId (so it re-derives on
 * replay), and `agent(p, o)` = `spawnThread(o).askAgent(p, o)` (one-shot, thread not retained).
 *
 * Ask verbs with a `schema` enforce it via an internal corrective-retry loop: on a decode
 * mismatch the verb re-asks (fresh turn, fresh `seq`) up to {@link MAX_SCHEMA_ATTEMPTS} before
 * throwing {@link SchemaExhaustedError}. Each attempt is journaled, so the loop replays.
 */

import { planAskRender } from "./t3work-sdk.askRender.ts";
import type { MessageBroker } from "./t3work-sdk.broker.ts";
import { PermissionDeniedError, SchemaExhaustedError } from "./t3work-sdk.errors.ts";
import type { HandleDispatch, ReplyResolver } from "./t3work-sdk.handles.ts";
import { decodeWithSchema } from "./t3work-sdk.internal.ts";
import type {
  AskOpts,
  AskUserOpts,
  SpawnThreadOpts,
  Thread,
  WorkflowThreadPrimitives,
} from "./t3work-sdk.threadTypes.ts";
import type { ModelSelection } from "./t3work-sdk.types.ts";

export type {
  AskOpts,
  AskUserAttachment,
  AskUserOpts,
  SpawnThreadOpts,
  Thread,
  ThreadRef,
  WorkflowThreadPrimitives,
} from "./t3work-sdk.threadTypes.ts";

/** One attempt + two corrective retries. */
const MAX_SCHEMA_ATTEMPTS = 3;

export function createThreadPrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
  readonly launchThreadId: string | undefined;
  readonly defaultModel: ModelSelection | undefined;
}): WorkflowThreadPrimitives {
  const { dispatch, broker } = deps;
  const has = (cap: string): boolean => deps.capabilities.has(cap);

  const fireEnvelope =
    (kind: "thread.turn" | "thread.message" | "user.input", payload: unknown) =>
    (correlationId: string, resolver: ReplyResolver): Promise<void> =>
      broker.send({ correlationId, kind, payload }, resolver);

  /** Drive an ask verb (`thread.turn` / `user.input`) with the schema corrective-retry loop. */
  const askVerb = async <R>(
    kind: "thread.turn" | "user.input",
    threadId: string,
    basePrompt: string,
    opts: AskUserOpts<R> | undefined,
  ): Promise<R> => {
    const schema = opts?.schema;
    const model = opts?.model ?? deps.defaultModel;
    const promptField = kind === "thread.turn" ? "prompt" : "question";
    // A `user.input` carries everything the host needs to render the decision card: the affordance
    // descriptor derived from the schema (the live schema object stays inside the runtime), the
    // attachment refs, and the prompt/coercion the affordance implies. The plan is a pure function
    // of the (replay-stable) schema + opts, so the payload — and its argsHash — re-derives
    // identically on replay.
    const plan = planAskRender({
      kind,
      schema,
      attachments: kind === "user.input" ? opts?.attachments : undefined,
      labels: opts?.labels,
    });
    let prompt = `${basePrompt}${plan.promptSuffix}`;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const payload = {
        threadId,
        [promptField]: prompt,
        ...plan.renderFields,
        ...(model === undefined ? {} : { model }),
      };
      const correlationId = await dispatch.send({
        kind,
        refId: kind,
        args: payload,
        fire: fireEnvelope(kind, payload),
      });
      const reply = await dispatch.awaitResolution<unknown>(correlationId, undefined);
      if (schema === undefined) return String(reply) as R;
      try {
        return await decodeWithSchema(schema, plan.coerceReply(reply), "Invalid thread reply");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (attempt >= MAX_SCHEMA_ATTEMPTS) {
          throw new SchemaExhaustedError(
            `${kind} on thread '${threadId}' did not satisfy the response schema after ${attempt} attempts: ${detail}`,
          );
        }
        prompt = `${basePrompt}\n\nYour previous reply did not match the required schema (${detail}). ${plan.correctiveInstruction}`;
      }
    }
  };

  const notify = (threadId: string, recipient: "agent" | "user", text: string): void => {
    const payload = { threadId, recipient, text };
    dispatch.sendOneWay({
      kind: "thread.message",
      refId: "thread.message",
      args: payload,
      fire: fireEnvelope("thread.message", payload),
    });
  };

  const denied =
    (cap: string, verb: string): (() => never) =>
    () => {
      throw new PermissionDeniedError(
        `'${verb}' requires the '${cap}' capability. Add '${cap}' to this workflow's meta.capabilities.`,
      );
    };

  const withThreadModel = <R>(
    o: AskOpts<R> | undefined,
    threadModel: ModelSelection | undefined,
  ): AskOpts<R> => {
    const model = o?.model ?? threadModel;
    return { ...o, ...(model === undefined ? {} : { model }) };
  };

  const makeThread = (threadId: string, threadModel: ModelSelection | undefined): Thread => ({
    id: { kind: "thread-ref", id: threadId },
    askAgent: <R>(p: string, o?: AskOpts<R>) =>
      askVerb<R>("thread.turn", threadId, p, withThreadModel(o, threadModel)),
    notifyAgent: (msg: string) => notify(threadId, "agent", msg),
    askUser: has("user")
      ? <R>(q: string, o?: AskUserOpts<R>) => askVerb<R>("user.input", threadId, q, o)
      : (denied("user", "askUser") as Thread["askUser"]),
    notifyUser: has("user")
      ? (msg: string) => notify(threadId, "user", msg)
      : (denied("user", "notifyUser") as Thread["notifyUser"]),
  });

  const spawnThread = (opts?: SpawnThreadOpts): Thread => {
    const model = opts?.model ?? deps.defaultModel;
    const args = opts?.name === undefined ? {} : { name: opts.name };
    const threadId = dispatch.sendOneWay({
      kind: "thread.create",
      refId: "thread.create",
      args,
      fire: (correlationId, resolver) =>
        broker.send(
          {
            correlationId,
            kind: "thread.create",
            payload: {
              threadId: correlationId,
              ...(opts?.name === undefined ? {} : { name: opts.name }),
              ...(model === undefined ? {} : { model }),
            },
          },
          resolver,
        ),
    });
    return makeThread(threadId, model);
  };

  const agent = <R = string>(prompt: string, opts?: AskOpts<R>): Promise<R> =>
    spawnThread(opts?.model === undefined ? {} : { model: opts.model }).askAgent(prompt, opts);

  return {
    thread:
      deps.launchThreadId === undefined
        ? undefined
        : makeThread(deps.launchThreadId, deps.defaultModel),
    spawnThread,
    agent,
  };
}
