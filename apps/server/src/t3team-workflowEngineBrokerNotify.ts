/**
 * The broker's ONE-WAY verbs: `wait.until` and `thread.message`.
 *
 * Neither settles a resolver. `wait.until` parks the run out of band — it records the wake deadline
 * and its correlation so the scheduler can arm a timer and resolve it on fire, which is why there is
 * no orchestration command (a timer has no message). `thread.message` floats a message and returns.
 * Both swallow dispatch failures, unlike the ask verbs, so a lost notification cannot fail a run.
 */
import * as DateTime from "effect/DateTime";

import type { BrokerCore, BrokerSend } from "./t3team-workflowEngineBrokerContext.ts";
import {
  TRUSTED_HTML_FRAGMENT,
  workflowWidgetAttachment,
} from "./t3team-workflowEngineBrokerContext.ts";
import {
  messageUpsert,
  type ThreadMessagePayload,
  type WaitUntilPayload,
} from "./t3team-workflowEngineBrokerTypes.ts";

export async function handleBrokerNotifyVerb(core: BrokerCore, s: BrokerSend): Promise<void> {
  const { deps, enqueueOneWay, runPrimitive, step } = core;
  const { correlationId, kind, payload } = s;
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
                // Visible to the AGENT too, deliberately. `visibleToUser: true` with
                // `visibleToAgent: false` puts the user and the agent in two different
                // conversations, and this is the one message where that diverges hardest: it is
                // the run's report. Observed 2026-08-29 — a delivery run posted its QA verdict
                // here, the user then asked "can u summarize and tell me next step", and the
                // agent answered that the pipeline was still running. The report was on screen
                // and filtered out of its prompt (`describeAgentVisibleSystemMessage` drops
                // system messages flagged false), so it had the completion line's verdict with
                // none of the substance behind it and fell back to restating the launch plan.
                //
                // The cost is prompt weight when a workflow notifies often. That is the right
                // trade: a chatty run makes the context longer, a hidden report makes the agent
                // wrong. Brevity belongs to the author — see t3team_help("reporting").
                //
                // The WIDGET branches above stay false on purpose: their payload is HTML the
                // agent itself authored, so re-injecting it is cost without information.
                visibleToAgent: true,
              }
            : undefined,
        ),
      ),
    ),
  );
}
