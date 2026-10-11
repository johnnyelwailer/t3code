// @effect-diagnostics globalConsole:off -- refusal/delivery log in the one-way Promise broker path, outside any Effect runtime.
/**
 * The broker side of `Thread.showView`: post a registered view into a thread as a
 * `{ kind: "view" }` attachment, keyed so a re-post updates the same row in place.
 *
 * The message id is derived from the thread and the author's key, so the host's
 * `message-ext:<messageId>` artifact is the one row for that key: the artifacts store skips an
 * identical re-upsert, and a changed one keeps the row's position. The web timeline renders the
 * attachment through the `message.view` registry (`t3team-messageViewRegistry.ts`).
 *
 * The run is not trusted, so the input is re-checked here with the rules the primitive applies
 * at the call site (including the reserved host `t3team.*` namespace). `showView` is ONE-WAY: the
 * SDK fires it without awaiting, so this handler must never reject — a rejection here is an
 * unhandled rejection that takes the server down. A refused or failed post is logged and shown as
 * the step's detail instead.
 */
import { showViewInputProblem, type ShowViewInput } from "@t3team/sdk";

import type { BrokerCore, BrokerSend } from "./t3team-workflowEngineBrokerContext.ts";

const workflowViewMessageId = (threadId: string, key: string) =>
  `t3team-wf-view:${threadId}:${key}`;

export async function handleBrokerShowView(
  core: BrokerCore,
  s: Pick<BrokerSend, "correlationId" | "kind">,
  input: { readonly threadId: string; readonly view: ShowViewInput },
): Promise<void> {
  const { deps, enqueueOneWay, runPrimitive, step } = core;
  const { threadId, view } = input;
  const problem = showViewInputProblem(view);
  if (problem !== null) {
    console.warn(`[t3team-workflow] run ${deps.runId} showView refused: ${problem}`);
    step(s.correlationId, s.kind, "completed", `View not shown: ${problem}`, threadId);
    return;
  }
  step(s.correlationId, s.kind, "completed", `Showed ${view.viewId}`, threadId);
  try {
    await runPrimitive(() =>
      enqueueOneWay(() =>
        deps.host.postMessage({
          threadId,
          messageId: workflowViewMessageId(threadId, view.key),
          role: "system",
          text: "",
          ext: {
            author: { kind: "system", workflowRunId: deps.runId },
            visibleToUser: true,
            visibleToAgent: false,
            attachments: [{ kind: "view", miniappId: view.viewId, props: { ...view.props } }],
          },
        }),
      ),
    );
  } catch (error) {
    // `runPrimitive` refuses once the run was stopped; a one-way verb has nobody to tell.
    console.warn(`[t3team-workflow] run ${deps.runId} showView not posted:`, error);
  }
}
