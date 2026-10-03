/**
 * The broker's ASK verbs: `thread.turn` and `user.input`.
 *
 * These are the two that park a run. Both are awaited rather than floated, so a failure to start
 * the turn fails the run instead of leaving it suspended forever on a turn that never began — which
 * is why they live together and apart from the one-way verbs.
 *
 * Returns true when the envelope was handled, so the broker's dispatch stays a flat chain.
 */
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION } from "@t3tools/project-recipes";

import type { BrokerCore, BrokerSend } from "./t3team-workflowEngineBrokerContext.ts";
import type { ThreadTurnPayload, UserInputPayload } from "./t3team-workflowEngineBrokerTypes.ts";
import {
  isMessageResourceRef,
  TRUSTED_HTML_FRAGMENT,
  workflowWidgetAttachment,
} from "./t3team-workflowEngineBrokerContext.ts";
import { resolveWorkflowChildModel } from "./t3team-workflowChildModel.ts";
import { workflowTurnAuthor } from "./t3team-workflowTurnAuthor.ts";
import { newWorkflowStepPromptMessageId } from "./t3team-workflowTurnPrompt.ts";
import { workflowTurnText } from "./t3team-workflowTurnText.ts";

export async function handleBrokerAskVerb(core: BrokerCore, s: BrokerSend): Promise<boolean> {
  const { deps, enqueue, runPrimitive, step } = core;
  const { correlationId, kind, payload, isLiveCompositionAsk, makeLiveSettlement } = s;
  if (kind === "thread.turn") {
    const p = payload as ThreadTurnPayload;
    // Resolve BEFORE recording pending state (registry + durable recordPending): an invalid
    // provider/model must reject this ask cleanly, not park the run on an undispatched turn.
    // Stay SYNCHRONOUS when there is nothing to resolve: awaiting unconditionally would yield a
    // microtask before `setPending`, and callers observe the pending entry right after `send`.
    const modelSelection =
      p.model === undefined && p.effort === undefined
        ? deps.modelSelection
        : await resolveWorkflowChildModel(deps.modelSelection, p.model, p.effort);
    step(correlationId, kind, "started", p.label ?? p.prompt, p.threadId);
    const liveSettlement = isLiveCompositionAsk ? makeLiveSettlement() : null;
    // ONE author for the whole step: it rides the prompt below, and the reactor reuses it to
    // attribute the assistant messages that answer it.
    const author = workflowTurnAuthor(deps.runId, correlationId, p);
    // The prompt's id is fixed BEFORE the dispatch: the run it starts is the run whose end
    // answers this step, and a reactor check racing the dispatch must find the ask waiting on it.
    const promptMessageId = newWorkflowStepPromptMessageId(correlationId);
    deps.registry.setPending(p.threadId, {
      runId: deps.runId,
      correlationId,
      kind: "thread.turn",
      author,
      promptMessageId,
      ...(liveSettlement ? { resolveLive: liveSettlement.resolve } : {}),
    });
    await runPrimitive(
      () =>
        enqueue(() =>
          // Queued behind any active run on the thread (a busy thread is not an error), so the
          // step's own run answers it. `user` role because that is how a provider receives turn
          // input — NOT because a person wrote it; the author stamp says so.
          deps.host.startTurn({
            threadId: p.threadId,
            messageId: promptMessageId,
            text: workflowTurnText(p),
            modelSelection,
            author,
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
    return true;
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
    const visibleQuestion = htmlContext ? p.label?.trim() || "Respond to this request" : p.question;
    const renderAsCard =
      affordance.kind !== "text" || resources.length > 0 || htmlContext !== undefined;
    await runPrimitive(
      () =>
        enqueue(() =>
          deps.host.postMessage({
            threadId: p.threadId,
            messageId: `t3team-wf-ask:${correlationId}`,
            role: "system",
            text: visibleQuestion,
            ext: {
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
            },
          }),
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
    return true;
  }
  return false;
}
