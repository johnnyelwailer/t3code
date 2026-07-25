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
  T3TeamMessageExternalResourceRef,
  ThreadId,
} from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION } from "@t3tools/project-recipes";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import type { MessageBroker, MessageEnvelope } from "@t3team/sdk";

import {
  messageUpsert,
  type ThreadCreatePayload,
  type ThreadMessagePayload,
  type ThreadTurnPayload,
  type UserInputPayload,
  type WaitUntilPayload,
  type WorkflowEngineBrokerDeps,
} from "./t3team-workflowEngineBrokerTypes.ts";
import { workflowStepDetailSnippet } from "./t3team-workflowEngineStepActivities.ts";
import { dispatchWorkflowChild } from "./t3team-workflowChildPlacement.ts";
import { resolveWorkflowChildModel } from "./t3team-workflowChildModel.ts";
import { createWorkflowLiveSettlement } from "./t3team-workflowLiveSettlement.ts";
import {
  buildT3TeamWidgetAttachment,
  parseT3TeamWidgetShowInput,
} from "./t3team-widgetShowCore.ts";

export type {
  WorkflowEngineBrokerDeps,
  WorkflowEnginePendingAsk,
  WorkflowEngineSleep,
} from "./t3team-workflowEngineBrokerTypes.ts";

type ReplyResolver = Parameters<MessageBroker["send"]>[1];

/** Attachment refs from the workflow are opaque payload (SDK black-box rule); only refs that
 * satisfy the message contract render as resource cards — anything else is dropped, never fatal. */
const isMessageResourceRef = Schema.is(T3TeamMessageExternalResourceRef);
const TRUSTED_HTML_FRAGMENT = /<\/?[a-z][^>]*>/i;

function workflowWidgetAttachment(input: {
  readonly widgetId: string;
  readonly title: string;
  readonly widgetCode: string;
  readonly format?: "html" | "svg";
  readonly loadingMessages?: ReadonlyArray<string>;
}) {
  const parsed = parseT3TeamWidgetShowInput({
    title: input.title,
    widget_code: input.widgetCode,
    ...(input.format === undefined ? {} : { format: input.format }),
    ...(input.loadingMessages === undefined ? {} : { loading_messages: input.loadingMessages }),
  });
  if ("error" in parsed) throw new Error(`Invalid workflow widget: ${parsed.error}`);
  return buildT3TeamWidgetAttachment({
    widgetId: input.widgetId,
    parsed,
    artifactRelativePath: undefined,
  });
}

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

  const send = async (envelope: MessageEnvelope, resolver: ReplyResolver): Promise<void> => {
    const { correlationId, kind, payload } = envelope;
    const isLiveCompositionAsk = correlationId.startsWith(`${deps.runId}:blackbox:`);
    const makeLiveSettlement = () =>
      createWorkflowLiveSettlement({
        beforeResolve: () =>
          deps.stepActivities?.emitResolved(correlationId, "completed") ?? Promise.resolve(),
        resolve: resolver.resolve,
      });
    if (kind === "thread.create") {
      const p = payload as ThreadCreatePayload;
      // Resolve BEFORE registering/dispatching: enqueueOneWay swallows dispatch errors, so an
      // invalid provider/model must reject this send() while the SDK still observes it.
      const modelSelection =
        p.model === undefined
          ? deps.modelSelection
          : await resolveWorkflowChildModel(deps.modelSelection, p.model);
      step(correlationId, kind, "completed", p.name ?? "Spawn thread", p.threadId);
      await runPrimitive(() => enqueueOneWay(() => dispatchWorkflowChild(deps, p, modelSelection)));
      return;
    }
    if (kind === "thread.turn") {
      const p = payload as ThreadTurnPayload;
      // Resolve BEFORE recording pending state (registry + durable recordPending): an invalid
      // provider/model must reject this ask cleanly, not park the run on an undispatched turn.
      const modelSelection =
        p.model === undefined
          ? deps.modelSelection
          : await resolveWorkflowChildModel(deps.modelSelection, p.model);
      step(correlationId, kind, "started", p.label ?? p.prompt, p.threadId);
      const liveSettlement = isLiveCompositionAsk ? makeLiveSettlement() : null;
      deps.registry.setPending(p.threadId, {
        runId: deps.runId,
        correlationId,
        kind: "thread.turn",
        ...(liveSettlement ? { resolveLive: liveSettlement.resolve } : {}),
      });
      await runPrimitive(
        () =>
          enqueue(() =>
            deps.dispatch({
              type: "thread.turn.start",
              commandId: CommandId.make(`t3team-wf:turn:${deps.newId()}`),
              threadId: ThreadId.make(p.threadId),
              message: {
                messageId: MessageId.make(deps.newId()),
                role: "user",
                text: p.prompt,
                attachments: [],
              },
              modelSelection,
              runtimeMode: deps.runtimeMode,
              interactionMode: deps.interactionMode,
              createdAt: deps.nowIso(),
            }),
          ),
        liveSettlement
          ? undefined
          : async () => {
              await deps.recordPending?.({
                threadId: p.threadId,
                correlationId,
                kind: "thread.turn",
              });
            },
      );
      await liveSettlement?.completed;
      return;
    }
    if (kind === "user.input") {
      const p = payload as UserInputPayload;
      step(correlationId, kind, "waiting", p.label ?? p.question, p.threadId);
      const affordance = p.affordance ?? { kind: "text" as const };
      const liveSettlement = isLiveCompositionAsk ? makeLiveSettlement() : null;
      deps.registry.setPending(p.threadId, {
        runId: deps.runId,
        correlationId,
        kind: "user.input",
        affordance,
        ...(liveSettlement ? { resolveLive: liveSettlement.resolve } : {}),
      });
      // Tag the escalation message as awaiting the user's answer (with the owning run) so the UI
      // can render it as a guided prompt and route the reply back to this run rather than a
      // free-form chat turn. An ask that is renderable as a decision card (a choice affordance,
      // or attached resources) additionally carries the `workflow.decision` view + the resource
      // refs; a plain text ask keeps today's bare message + composer.
      const resources = (p.attachments ?? []).filter(isMessageResourceRef);
      const htmlContext = TRUSTED_HTML_FRAGMENT.test(p.question)
        ? workflowWidgetAttachment({
            widgetId: deps.newId(),
            title: p.label?.trim() || "workflow_input",
            widgetCode: p.question,
          })
        : undefined;
      const visibleQuestion = htmlContext
        ? p.label?.trim() || "Respond to this request"
        : p.question;
      const renderAsCard =
        affordance.kind !== "text" || resources.length > 0 || htmlContext !== undefined;
      await runPrimitive(
        () =>
          enqueue(() =>
            deps.dispatch(
              messageUpsert(deps, p.threadId, "system", visibleQuestion, {
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
                            question: visibleQuestion,
                            affordance,
                            correlationId,
                            workflowRunId: deps.runId,
                          },
                        },
                        ...(htmlContext ? [htmlContext] : []),
                        ...resources.map((resource) => ({ kind: "resource" as const, resource })),
                      ],
                    }
                  : {}),
              }),
            ),
          ),
        liveSettlement
          ? undefined
          : async () => {
              await deps.recordPending?.({
                threadId: p.threadId,
                correlationId,
                kind: "user.input",
              });
            },
      );
      await liveSettlement?.completed;
      return;
    }
    if (kind === "wait.until") {
      // The clock park (Epic 27): record the wake deadline + this `waitUntil` correlation so
      // the scheduler can arm a timer and resolve it on fire. No orchestration command (a timer
      // has no message) and no resolver settle — the run suspends out of band until the
      // scheduler appends the resolved entry at the deadline.
      const p = payload as WaitUntilPayload;
      step(
        correlationId,
        kind,
        "waiting",
        `Sleep until ${DateTime.formatIso(DateTime.makeUnsafe(p.deadline))}`,
      );
      await runPrimitive(async () => {
        await deps.recordSleeping?.({ correlationId, deadline: p.deadline });
      });
      return;
    }
    // thread.message — one-way; agent-directed messages read as a user turn-input, user-directed
    // ones as a system (user-visible) note. No turn.start, no pending.
    const p = payload as ThreadMessagePayload;
    if (p.widget !== undefined) {
      // Workflow semantic adapter: reuse the canonical widget parser/attachment factory rather
      // than duplicating validation or inventing a second rendering contract.
      const attachment = workflowWidgetAttachment({
        widgetId: deps.newId(),
        title: p.widget.title,
        widgetCode: p.widget.widgetCode,
        ...(p.widget.format === undefined ? {} : { format: p.widget.format }),
        ...(p.widget.loadingMessages === undefined
          ? {}
          : { loadingMessages: p.widget.loadingMessages }),
      });
      step(correlationId, kind, "completed", p.widget.title, p.threadId);
      await runPrimitive(() =>
        enqueueOneWay(() =>
          deps.dispatch(
            messageUpsert(deps, p.threadId, "system", "", {
              author: { kind: "system", workflowRunId: deps.runId },
              visibleToUser: true,
              visibleToAgent: false,
              attachments: [attachment],
            }),
          ),
        ),
      );
      return;
    }
    if (p.recipient === "user" && TRUSTED_HTML_FRAGMENT.test(p.text)) {
      const attachment = workflowWidgetAttachment({
        widgetId: deps.newId(),
        title: "workflow_notification",
        widgetCode: p.text,
      });
      step(correlationId, kind, "completed", "Workflow notification", p.threadId);
      await runPrimitive(() =>
        enqueueOneWay(() =>
          deps.dispatch(
            messageUpsert(deps, p.threadId, "system", "", {
              author: { kind: "system", workflowRunId: deps.runId },
              visibleToUser: true,
              visibleToAgent: false,
              attachments: [attachment],
            }),
          ),
        ),
      );
      return;
    }
    step(correlationId, kind, "completed", p.text, p.threadId);
    await runPrimitive(() =>
      enqueueOneWay(() =>
        deps.dispatch(
          messageUpsert(
            deps,
            p.threadId,
            p.recipient === "agent" ? "user" : "system",
            p.text,
            p.recipient === "user"
              ? {
                  author: { kind: "system", workflowRunId: deps.runId },
                  visibleToUser: true,
                  visibleToAgent: false,
                }
              : undefined,
          ),
        ),
      ),
    );
  };

  return { send };
}
