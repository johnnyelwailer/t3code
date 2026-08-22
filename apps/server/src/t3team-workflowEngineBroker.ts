/**
 * The orchestration-backed {@link MessageBroker} for the workflow engine (Epic 25 §Host
 * wiring). Each thread verb fired by a workflow body maps onto one orchestration command:
 *
 *   • thread.create  → dispatch(thread.create)        — make the spawned thread.
 *   • thread.turn    → dispatch(thread.turn.start)     — start an agent turn; record a pending
 *                       ask so the reactor can resolve it when the turn completes.
 *   • thread.message → dispatch(thread.message.upsert) — post a one-way message (no turn).
 *   • user.input     → dispatch(thread.message.upsert, role system) — request user input; record
 *                       a pending ask resolved when the user replies.
 *
 * The broker is created per run, so it carries the run's id, project, and model selection.
 * Dispatches are chained on a single tail promise: `thread.create` is fired floating by the
 * SDK's one-way `sendOneWay`, so chaining guarantees the create lands before the `thread.turn`
 * it precedes (turn-on-a-missing-thread would otherwise race).
 */

import type { MessageBroker, MessageEnvelope } from "@t3team/sdk";

import {
  type ModelResolvePayload,
  type ThreadCreatePayload,
  type WorkflowEngineBrokerDeps,
} from "./t3team-workflowEngineBrokerTypes.ts";
import { workflowStepDetailSnippet } from "./t3team-workflowEngineStepActivities.ts";
import { dispatchWorkflowChild } from "./t3team-workflowChildPlacement.ts";
import {
  resolveWorkflowChildModel,
  resolveWorkflowModelCascade,
} from "./t3team-workflowChildModel.ts";
import { toWorkflowModelSelection } from "./t3team-workflowModelSelection.ts";
import { createWorkflowLiveSettlement } from "./t3team-workflowLiveSettlement.ts";
import { handleBrokerAskVerb } from "./t3team-workflowEngineBrokerAsk.ts";
import { handleBrokerNotifyVerb } from "./t3team-workflowEngineBrokerNotify.ts";
import type {
  BrokerCore,
  BrokerSend,
  ReplyResolver,
} from "./t3team-workflowEngineBrokerContext.ts";

export type {
  WorkflowEngineBrokerDeps,
  WorkflowEnginePendingAsk,
  WorkflowEngineSleep,
} from "./t3team-workflowEngineBrokerTypes.ts";

export function createWorkflowEngineBroker(deps: WorkflowEngineBrokerDeps): MessageBroker {
  // Serialize dispatches so a floated `thread.create` lands before the `thread.turn` it precedes.
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>): Promise<void> => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => {});
    return next;
  };
  // Ask verbs (thread.turn / user.input) are awaited, so their failures propagate and fail the
  // run rather than parking it forever on a turn that never started.
  const enqueueOneWay = (fn: () => Promise<void>): Promise<void> => enqueue(fn).catch(() => {});
  const runPrimitive = async (
    fn: () => Promise<void>,
    beforeDispatch?: () => Promise<void>,
  ): Promise<void> => {
    if ((await deps.beforePrimitive?.()) === false) throw new Error("Workflow was stopped");
    try {
      await beforeDispatch?.();
      await fn();
    } finally {
      deps.afterPrimitive?.();
    }
  };

  // Live step-status pip (UX slice 1): fire-and-forget — the emitter swallows its own failures.
  const step = (
    correlationId: string,
    kind: string,
    phase: "started" | "waiting" | "completed",
    detail?: string,
    threadId?: string,
  ): void => {
    void deps.stepActivities?.emitSent({
      correlationId,
      stepKind: kind,
      phase,
      ...(detail === undefined ? {} : { detail: workflowStepDetailSnippet(detail) }),
      ...(threadId === undefined ? {} : { threadId }),
    });
  };

  const core: BrokerCore = { deps, enqueue, enqueueOneWay, runPrimitive, step };

  const send = async (envelope: MessageEnvelope, resolver: ReplyResolver): Promise<void> => {
    const { correlationId, kind, payload } = envelope;
    const isLiveCompositionAsk = correlationId.startsWith(`${deps.runId}:blackbox:`);
    const makeLiveSettlement = () =>
      createWorkflowLiveSettlement({
        beforeResolve: () =>
          deps.stepActivities?.emitResolved(correlationId, "completed") ?? Promise.resolve(),
        resolve: resolver.resolve,
      });
    const sendCtx: BrokerSend = {
      correlationId,
      kind,
      payload,
      resolver,
      isLiveCompositionAsk,
      makeLiveSettlement,
    };
    if (kind === "model.resolve") {
      // Walk the author's provider ladder against the LIVE registry and settle SYNCHRONOUSLY: the
      // chosen selection becomes this primitive's `resolved` journal line, so a replay reuses the
      // recorded choice instead of re-probing a registry whose availability may have changed.
      const p = payload as ModelResolvePayload;
      const choice = await resolveWorkflowModelCascade(deps.modelSelection, p.entries);
      step(correlationId, kind, "completed", `Model cascade — ${choice.reason}`);
      resolver.resolve({
        selection:
          choice.selection === undefined ? null : toWorkflowModelSelection(choice.selection),
        reason: choice.reason,
      });
      return;
    }
    if (kind === "thread.create") {
      const p = payload as ThreadCreatePayload;
      if (deps.registry.childThreadsForRun(deps.runId).includes(p.threadId)) return;
      // Resolve BEFORE registering/dispatching: enqueueOneWay swallows dispatch errors, so an
      // invalid provider/model must reject this send() while the SDK still observes it.
      // Stay SYNCHRONOUS when there is nothing to resolve: awaiting unconditionally would yield a
      // microtask before `setPending`, and callers observe the pending entry right after `send`.
      const modelSelection =
        p.model === undefined && p.effort === undefined
          ? deps.modelSelection
          : await resolveWorkflowChildModel(deps.modelSelection, p.model, p.effort);
      step(correlationId, kind, "completed", p.name ?? "Spawn thread", p.threadId);
      await runPrimitive(() => enqueueOneWay(() => dispatchWorkflowChild(deps, p, modelSelection)));
      return;
    }
    if (await handleBrokerAskVerb(core, sendCtx)) return;
    await handleBrokerNotifyVerb(core, sendCtx);
  };

  return { send };
}
