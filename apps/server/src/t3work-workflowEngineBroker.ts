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

import {
  CommandId,
  MessageId,
  T3workMessageExternalResourceRef,
  ThreadId,
} from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION } from "@t3tools/project-recipes";
import * as Schema from "effect/Schema";

import type { MessageBroker, MessageEnvelope } from "@t3work/sdk";

import {
  messageUpsert,
  type ThreadCreatePayload,
  type ThreadMessagePayload,
  type ThreadTurnPayload,
  type UserInputPayload,
  type WaitUntilPayload,
  type WorkflowEngineBrokerDeps,
} from "./t3work-workflowEngineBrokerTypes.ts";

export type {
  WorkflowEngineBrokerDeps,
  WorkflowEnginePendingAsk,
  WorkflowEngineSleep,
} from "./t3work-workflowEngineBrokerTypes.ts";

/** Attachment refs from the workflow are opaque payload (SDK black-box rule); only refs that
 * satisfy the message contract render as resource cards — anything else is dropped, never fatal. */
const isMessageResourceRef = Schema.is(T3workMessageExternalResourceRef);

export function createWorkflowEngineBroker(deps: WorkflowEngineBrokerDeps): MessageBroker {
  // Serialize dispatches so a floated `thread.create` lands before the `thread.turn` it precedes.
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>): Promise<void> => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => {});
    return next;
  };
  // One-way verbs (thread.create / thread.message) are fired floating by the SDK, so a
  // dispatch rejection would become an unhandled rejection; swallow it (best-effort delivery).
  // Ask verbs (thread.turn / user.input) are awaited, so their failures propagate and fail the
  // run rather than parking it forever on a turn that never started.
  const enqueueOneWay = (fn: () => Promise<void>): Promise<void> => enqueue(fn).catch(() => {});

  const send = async (envelope: MessageEnvelope): Promise<void> => {
    const { correlationId, kind, payload } = envelope;
    if (kind === "thread.create") {
      const p = payload as ThreadCreatePayload;
      await enqueueOneWay(() =>
        deps.dispatch({
          type: "thread.create",
          commandId: CommandId.make(`t3work-wf:create:${deps.newId()}`),
          threadId: ThreadId.make(p.threadId),
          projectId: deps.projectId,
          title: p.name ?? "Workflow thread",
          modelSelection: deps.modelSelection,
          runtimeMode: deps.runtimeMode,
          interactionMode: deps.interactionMode,
          branch: null,
          worktreePath: null,
          createdAt: deps.nowIso(),
        }),
      );
      return;
    }
    if (kind === "thread.turn") {
      const p = payload as ThreadTurnPayload;
      deps.registry.setPending(p.threadId, {
        runId: deps.runId,
        correlationId,
        kind: "thread.turn",
      });
      await deps.recordPending?.({ threadId: p.threadId, correlationId, kind: "thread.turn" });
      await enqueue(() =>
        deps.dispatch({
          type: "thread.turn.start",
          commandId: CommandId.make(`t3work-wf:turn:${deps.newId()}`),
          threadId: ThreadId.make(p.threadId),
          message: {
            messageId: MessageId.make(deps.newId()),
            role: "user",
            text: p.prompt,
            attachments: [],
          },
          modelSelection: deps.modelSelection,
          runtimeMode: deps.runtimeMode,
          interactionMode: deps.interactionMode,
          createdAt: deps.nowIso(),
        }),
      );
      return;
    }
    if (kind === "user.input") {
      const p = payload as UserInputPayload;
      const affordance = p.affordance ?? { kind: "text" as const };
      deps.registry.setPending(p.threadId, {
        runId: deps.runId,
        correlationId,
        kind: "user.input",
        affordance,
      });
      await deps.recordPending?.({ threadId: p.threadId, correlationId, kind: "user.input" });
      // Tag the escalation message as awaiting the user's answer (with the owning run) so the UI
      // can render it as a guided prompt and route the reply back to this run rather than a
      // free-form chat turn. An ask that is renderable as a decision card (a choice affordance,
      // or attached resources) additionally carries the `workflow.decision` view + the resource
      // refs; a plain text ask keeps today's bare message + composer.
      const resources = (p.attachments ?? []).filter(isMessageResourceRef);
      const renderAsCard = affordance.kind !== "text" || resources.length > 0;
      await enqueue(() =>
        deps.dispatch(
          messageUpsert(deps, p.threadId, "system", p.question, {
            author: { kind: "system", workflowRunId: deps.runId },
            status: "waiting-for-input",
            visibleToUser: true,
            ...(renderAsCard
              ? {
                  attachments: [
                    {
                      kind: "view" as const,
                      miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
                      props: {
                        question: p.question,
                        affordance,
                        correlationId,
                        workflowRunId: deps.runId,
                      },
                    },
                    ...resources.map((resource) => ({ kind: "resource" as const, resource })),
                  ],
                }
              : {}),
          }),
        ),
      );
      return;
    }
    if (kind === "wait.until") {
      // The clock park (Epic 27): record the wake deadline + this `waitUntil` correlation so
      // the scheduler can arm a timer and resolve it on fire. No orchestration command (a timer
      // has no message) and no resolver settle — the run suspends out of band until the
      // scheduler appends the resolved entry at the deadline.
      const p = payload as WaitUntilPayload;
      await deps.recordSleeping?.({ correlationId, deadline: p.deadline });
      return;
    }
    // thread.message — one-way; agent-directed messages read as a user turn-input, user-directed
    // ones as a system (user-visible) note. No turn.start, no pending.
    const p = payload as ThreadMessagePayload;
    await enqueueOneWay(() =>
      deps.dispatch(
        messageUpsert(deps, p.threadId, p.recipient === "agent" ? "user" : "system", p.text),
      ),
    );
  };

  return { send };
}
