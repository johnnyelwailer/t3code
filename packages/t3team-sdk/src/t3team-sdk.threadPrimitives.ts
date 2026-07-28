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
 * The ask verbs' dispatch/schema-retry loop lives in `t3team-sdk.askVerb.ts`. A thread's `model`
 * and `effort` are its per-call defaults: an ask inherits them unless it names its own.
 */

import { createAskVerb, createFireEnvelope } from "./t3team-sdk.askVerb.ts";
import type { MessageBroker } from "./t3team-sdk.broker.ts";
import { resolveChildCapabilities } from "./t3team-sdk.capabilityGating.ts";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";
import type { HandleDispatch } from "./t3team-sdk.handles.ts";
import { createModelCascadeResolver, createThreadCascadeAsk } from "./t3team-sdk.modelCascade.ts";
import { type ThreadDefaults, withThreadDefaults } from "./t3team-sdk.threadDefaults.ts";
import type {
  AgentOpts,
  AskOpts,
  AskUserOpts,
  ShowWidgetInput,
  SpawnThreadOpts,
  Thread,
  WorkflowThreadPrimitives,
} from "./t3team-sdk.threadTypes.ts";
import type { ModelSelection } from "./t3team-sdk.types.ts";

export type {
  AgentEffort,
  AgentOpts,
  AskOpts,
  AskUserAttachment,
  AskUserOpts,
  ModelCascade,
  ModelCascadeEntry,
  ShowWidgetInput,
  SpawnThreadOpts,
  Thread,
  ThreadRef,
  WorkflowChildCapabilities,
  WorkflowThreadPrimitives,
} from "./t3team-sdk.threadTypes.ts";

const CHILD_TITLE_MAX_LENGTH = 80;

/** Human-readable compatibility title for older agent calls that supplied no label. */
export const workflowChildTitleFromPrompt = (prompt: string): string => {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return "Workflow task";
  if (normalized.length <= CHILD_TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, CHILD_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
};

export function createThreadPrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
  readonly launchThreadId: string | undefined;
  readonly defaultModel: ModelSelection | undefined;
  /** The body's `log` narrator, so a cascade can report which provider it landed on. */
  readonly log?: (message: string) => void;
}): WorkflowThreadPrimitives {
  const { dispatch, broker } = deps;
  const has = (cap: string): boolean => deps.capabilities.has(cap);
  const fireEnvelope = createFireEnvelope(broker);
  const askVerb = createAskVerb({ dispatch, broker, defaultModel: deps.defaultModel });
  const resolveCascade = createModelCascadeResolver({
    dispatch,
    broker,
    log: deps.log ?? (() => {}),
  });

  const notify = (threadId: string, recipient: "agent" | "user", text: string): void => {
    const payload = { threadId, recipient, text };
    dispatch.sendOneWay({
      kind: "thread.message",
      refId: "thread.message",
      args: payload,
      fire: fireEnvelope("thread.message", payload),
    });
  };

  const showWidget = (threadId: string, input: ShowWidgetInput): void => {
    const payload = { threadId, recipient: "user" as const, text: "", widget: input };
    dispatch.sendOneWay({
      kind: "thread.message",
      refId: "thread.showWidget",
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

  const makeThread = (threadId: string, defaults: ThreadDefaults): Thread => {
    // Cascade resolution + its per-thread memo live in t3team-sdk.modelCascade.ts; here we only
    // merge the thread's defaults in and hand the ask over.
    const cascadeAsk = createThreadCascadeAsk({
      askVerb,
      resolve: resolveCascade,
      threadId,
      threadLadder: defaults.models,
    });
    return {
      id: { kind: "thread-ref", id: threadId },
      askAgent: <R>(p: string, o?: AskOpts<R>) => cascadeAsk<R>(p, withThreadDefaults(o, defaults)),
      notifyAgent: (msg: string) => notify(threadId, "agent", msg),
      askUser: has("user")
        ? <R>(q: string, o?: AskUserOpts<R>) =>
            askVerb<R>("user.input", deps.launchThreadId ?? threadId, q, o)
        : (denied("user", "askUser") as Thread["askUser"]),
      notifyUser: has("user")
        ? (msg: string) => notify(threadId, "user", msg)
        : (denied("user", "notifyUser") as Thread["notifyUser"]),
      showWidget: has("user")
        ? (input: ShowWidgetInput) => showWidget(threadId, input)
        : (denied("user", "showWidget") as Thread["showWidget"]),
    };
  };

  // The child's grant is resolved and subset-checked EAGERLY, before the create fires: a child that
  // asks beyond its parent must fail at the spawn, not mid-turn as "tool is not enabled". It rides
  // in the broker payload, not in the journaled `args` — same treatment as `model`/`effort`, so
  // re-authoring a grant does not invalidate the replay of an already-suspended run.
  const spawnThread = (spawnOpts: SpawnThreadOpts): Thread => {
    // A body transpiled from disk may predate the requirement and pass nothing at all, so read
    // through a widened alias rather than trusting the declared type — see resolveChildCapabilities.
    const opts: Partial<SpawnThreadOpts> = spawnOpts ?? {};
    const model = opts.model ?? deps.defaultModel;
    const retention = opts.retention ?? "ephemeral";
    const capabilities = resolveChildCapabilities({
      declared: opts.capabilities,
      parent: deps.capabilities,
      childLabel: opts.name ?? "child thread",
    });
    const args = {
      ...(opts.name === undefined ? {} : { name: opts.name }),
      retention,
    };
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
              ...(opts.name === undefined ? {} : { name: opts.name }),
              ...(opts.retention === undefined ? {} : { retention: opts.retention }),
              ...(model === undefined ? {} : { model }),
              ...(opts.effort === undefined ? {} : { effort: opts.effort }),
              retention,
              capabilities,
            },
          },
          resolver,
        ),
    });
    return makeThread(threadId, { model, models: opts.models, effort: opts.effort });
  };

  // `models` rides through to the spawned thread so `agent()`'s create + turn share ONE
  // journaled cascade resolution (the ladder array identity is the same object).
  const agent = <R = string>(prompt: string, agentOpts: AgentOpts<R>): Promise<R> => {
    const opts: Partial<AgentOpts<R>> = agentOpts ?? {};
    return spawnThread({
      capabilities: opts.capabilities as AgentOpts<R>["capabilities"],
      name: opts.label?.trim() || workflowChildTitleFromPrompt(prompt),
      ...(opts.model === undefined ? {} : { model: opts.model }),
      ...(opts.models === undefined ? {} : { models: opts.models }),
      ...(opts.effort === undefined ? {} : { effort: opts.effort }),
    }).askAgent(prompt, opts);
  };

  return {
    thread:
      deps.launchThreadId === undefined
        ? undefined
        : makeThread(deps.launchThreadId, {
            model: deps.defaultModel,
            models: undefined,
            effort: undefined,
          }),
    spawnThread,
    agent,
  };
}
