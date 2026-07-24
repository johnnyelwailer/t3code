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
 * The ask verbs' dispatch/schema-retry loop lives in `t3work-sdk.askVerb.ts`. A thread's `model`
 * and `effort` are its per-call defaults: an ask inherits them unless it names its own.
 */

import { createAskVerb, createFireEnvelope } from "./t3work-sdk.askVerb.ts";
import type { MessageBroker } from "./t3work-sdk.broker.ts";
import { PermissionDeniedError } from "./t3work-sdk.errors.ts";
import type { HandleDispatch } from "./t3work-sdk.handles.ts";
import type {
  AgentEffort,
  AskOpts,
  AskUserOpts,
  ShowWidgetInput,
  SpawnThreadOpts,
  Thread,
  WorkflowThreadPrimitives,
} from "./t3work-sdk.threadTypes.ts";
import type { ModelSelection } from "./t3work-sdk.types.ts";

export type {
  AgentEffort,
  AskOpts,
  AskUserAttachment,
  AskUserOpts,
  ShowWidgetInput,
  SpawnThreadOpts,
  Thread,
  ThreadRef,
  WorkflowThreadPrimitives,
} from "./t3work-sdk.threadTypes.ts";

const CHILD_TITLE_MAX_LENGTH = 80;

/** Human-readable compatibility title for older agent calls that supplied no label. */
export const workflowChildTitleFromPrompt = (prompt: string): string => {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return "Workflow task";
  if (normalized.length <= CHILD_TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, CHILD_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
};

/** A thread's per-call defaults, applied to every ask that omits them. */
interface ThreadDefaults {
  readonly model: ModelSelection | undefined;
  readonly effort: AgentEffort | undefined;
}

export function createThreadPrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
  readonly launchThreadId: string | undefined;
  readonly defaultModel: ModelSelection | undefined;
}): WorkflowThreadPrimitives {
  const { dispatch, broker } = deps;
  const has = (cap: string): boolean => deps.capabilities.has(cap);
  const fireEnvelope = createFireEnvelope(broker);
  const askVerb = createAskVerb({ dispatch, broker, defaultModel: deps.defaultModel });

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

  const withThreadDefaults = <R>(
    o: AskOpts<R> | undefined,
    defaults: ThreadDefaults,
  ): AskOpts<R> => {
    const model = o?.model ?? defaults.model;
    const effort = o?.effort ?? defaults.effort;
    return {
      ...o,
      ...(model === undefined ? {} : { model }),
      ...(effort === undefined ? {} : { effort }),
    };
  };

  const makeThread = (threadId: string, defaults: ThreadDefaults): Thread => ({
    id: { kind: "thread-ref", id: threadId },
    askAgent: <R>(p: string, o?: AskOpts<R>) =>
      askVerb<R>("thread.turn", threadId, p, withThreadDefaults(o, defaults)),
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
  });

  const spawnThread = (opts?: SpawnThreadOpts): Thread => {
    const model = opts?.model ?? deps.defaultModel;
    const retention = opts?.retention ?? "ephemeral";
    const args = {
      ...(opts?.name === undefined ? {} : { name: opts.name }),
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
              ...(opts?.name === undefined ? {} : { name: opts.name }),
              ...(opts?.retention === undefined ? {} : { retention: opts.retention }),
              ...(model === undefined ? {} : { model }),
              ...(opts?.effort === undefined ? {} : { effort: opts.effort }),
              retention,
            },
          },
          resolver,
        ),
    });
    return makeThread(threadId, { model, effort: opts?.effort });
  };

  const agent = <R = string>(prompt: string, opts?: AskOpts<R>): Promise<R> =>
    spawnThread({
      name: opts?.label?.trim() || workflowChildTitleFromPrompt(prompt),
      ...(opts?.model === undefined ? {} : { model: opts.model }),
      ...(opts?.effort === undefined ? {} : { effort: opts.effort }),
    }).askAgent(prompt, opts);

  return {
    thread:
      deps.launchThreadId === undefined
        ? undefined
        : makeThread(deps.launchThreadId, { model: deps.defaultModel, effort: undefined }),
    spawnThread,
    agent,
  };
}
