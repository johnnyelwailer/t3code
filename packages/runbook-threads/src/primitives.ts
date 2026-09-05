/** Author-facing thread, child-thread, and one-shot agent primitives. */

import { createAskVerb, createFireEnvelope } from "./askVerb.ts";
import type { MessageBroker } from "./broker.ts";
import { resolveChildCapabilities } from "./capabilities.ts";
import { PermissionDeniedError } from "@runbook/core/errors";
import type { HandleDispatch } from "@runbook/core/handles";
import { createModelCascadeResolver, createThreadCascadeAsk } from "./modelCascade.ts";
import { type ThreadDefaults, withThreadDefaults } from "./defaults.ts";
import { workflowChildTitleFromPrompt } from "./titles.ts";
import type {
  AgentOpts,
  AskOpts,
  AskUserOpts,
  ShowWidgetInput,
  SpawnThreadOpts,
  Thread,
  WorkflowChildCapabilities,
  WorkflowThreadPrimitives,
} from "./types.ts";
import type { ModelSelection } from "./models.ts";

/**
 * Appended to every one-shot `agent()` prompt. The child thread runs with the ordinary assistant
 * persona, which pads a step's answer with word counts, "want a different angle?" offers and
 * questions back — text nobody can answer inside an orchestration and that flows straight into
 * the run's result (GHE #419). The contract is stated once, at the end, where the model reads it
 * last.
 */
export const AGENT_STEP_CONTRACT =
  "You are one step of an automated orchestration, not in a conversation: reply with exactly the " +
  "requested result and nothing else — no preamble, no summary of what you did, no word counts, " +
  "no offers to revise, no questions back.";

export function withAgentStepContract(prompt: string): string {
  return `${prompt.trimEnd()}\n\n${AGENT_STEP_CONTRACT}`;
}

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
} from "./types.ts";

export { workflowChildTitleFromPrompt } from "./titles.ts";

export function createThreadPrimitives<Capabilities = WorkflowChildCapabilities>(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
  readonly launchThreadId: string | undefined;
  readonly defaultModel: ModelSelection | undefined;
  /** The body's `log` narrator, so a cascade can report which provider it landed on. */
  readonly log?: (message: string) => void;
}): WorkflowThreadPrimitives<Capabilities> {
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
    // Cascade resolution + its per-thread memo live in modelCascade.ts; here we only
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
  const spawnThread = (spawnOpts: SpawnThreadOpts<Capabilities>): Thread => {
    // A body transpiled from disk may predate the requirement and pass nothing at all, so read
    // through a widened alias rather than trusting the declared type — see resolveChildCapabilities.
    const opts: Partial<SpawnThreadOpts<Capabilities>> = spawnOpts ?? {};
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
  const agent = <R = string>(prompt: string, agentOpts: AgentOpts<R, Capabilities>): Promise<R> => {
    const opts: Partial<AgentOpts<R, Capabilities>> = agentOpts ?? {};
    return spawnThread({
      capabilities: opts.capabilities as Capabilities,
      name: opts.label?.trim() || workflowChildTitleFromPrompt(prompt),
      ...(opts.model === undefined ? {} : { model: opts.model }),
      ...(opts.models === undefined ? {} : { models: opts.models }),
      ...(opts.effort === undefined ? {} : { effort: opts.effort }),
    }).askAgent(withAgentStepContract(prompt), opts);
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
