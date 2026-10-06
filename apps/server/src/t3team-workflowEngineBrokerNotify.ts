/**
 * The broker's ONE-WAY verbs: `wait.until` and `thread.message`.
 *
 * Neither settles a resolver. `wait.until` parks the run out of band — it records the wake deadline
 * and its correlation so the scheduler can arm a timer and resolve it on fire, which is why there is
 * no host call (a timer has no message). `thread.message` floats a message and returns.
 * Both swallow host failures, unlike the ask verbs, so a lost notification cannot fail a run.
 *
 * An AGENT-directed message rides a queued turn: on orchestration V2 an agent reads only what a
 * turn delivers, so a note posted beside the conversation would never reach it. The turn queues
 * behind whatever runs on the thread and precedes the next `askAgent` there, so the agent reads
 * the note before it answers. A USER-directed message is a run-less note (no turn).
 */
import * as DateTime from "effect/DateTime";

import type { BrokerCore, BrokerSend } from "./t3team-workflowEngineBrokerContext.ts";
import {
  TRUSTED_HTML_FRAGMENT,
  workflowWidgetAttachment,
} from "./t3team-workflowEngineBrokerContext.ts";
import type { ThreadMessagePayload, WaitUntilPayload } from "./t3team-workflowEngineBrokerTypes.ts";

export async function handleBrokerNotifyVerb(core: BrokerCore, s: BrokerSend): Promise<void> {
  const { deps, enqueueOneWay, runPrimitive, step } = core;
  const { correlationId, kind, payload } = s;
  if (kind === "wait.until") {
    // The clock park (Epic 27): record the wake deadline + this `waitUntil` correlation so
    // the scheduler can arm a timer and resolve it on fire. No host call (a timer has no
    // message) and no resolver settle — the run suspends out of band until the
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
  // thread.message — one-way; agent-directed messages ride a queued turn, user-directed ones are
  // a system (user-visible) note. No pending ask either way.
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
        deps.host.postMessage({
          threadId: p.threadId,
          messageId: `t3team-wf-msg:${correlationId}`,
          role: "system",
          text: "",
          ext: {
            author: { kind: "system", workflowRunId: deps.runId },
            visibleToUser: true,
            visibleToAgent: false,
            attachments: [attachment],
          },
        }),
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
        deps.host.postMessage({
          threadId: p.threadId,
          messageId: `t3team-wf-msg:${correlationId}`,
          role: "system",
          text: "",
          ext: {
            author: { kind: "system", workflowRunId: deps.runId },
            visibleToUser: true,
            visibleToAgent: false,
            attachments: [attachment],
          },
        }),
      ),
    );
    return;
  }
  if (p.recipient === "agent") {
    step(correlationId, kind, "completed", "Notified the agent", p.threadId);
    await runPrimitive(() =>
      enqueueOneWay(() =>
        deps.host.startTurn({
          threadId: p.threadId,
          messageId: `t3team-wf-msg:${correlationId}`,
          text: p.text,
          author: { kind: "system", workflowRunId: deps.runId, stepId: correlationId },
        }),
      ),
    );
    return;
  }
  // The notification itself is posted into the thread right below; repeating its clipped text
  // as the step's label/detail only adds a truncated duplicate (GHE #417). The note is run-less:
  // the person reads it; the agent learns the run's outcome from the run status tools.
  step(correlationId, kind, "completed", "Notified you", p.threadId);
  await runPrimitive(() =>
    enqueueOneWay(() =>
      deps.host.postMessage({
        threadId: p.threadId,
        messageId: `t3team-wf-msg:${correlationId}`,
        role: "system",
        text: p.text,
        ext: { author: { kind: "system", workflowRunId: deps.runId }, visibleToUser: true },
      }),
    ),
  );
}
