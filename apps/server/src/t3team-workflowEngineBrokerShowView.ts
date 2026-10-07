/**
 * The broker side of `Thread.showView`: post a registered view into a thread as a
 * `{ kind: "view" }` attachment, keyed so a re-post updates the same row in place.
 *
 * The message id is derived from the thread and the author's key, so the host's
 * `message-ext:<messageId>` artifact is the one row for that key: the artifacts store skips an
 * identical re-upsert, and a changed one keeps the row's position. The web timeline renders the
 * attachment through the `message.view` registry (`t3team-messageViewRegistry.ts`).
 *
 * The run is not trusted: the input is re-checked here with the same rules the primitive applies,
 * and the host's own `t3team.*` views are refused — they are posted by their own verbs (`askUser`
 * draws the decision card, the run draws its shape card) and their props are host state.
 */
import { showViewInputProblem, showViewNamespace, type ShowViewInput } from "@t3team/sdk";

import type { BrokerCore, BrokerSend } from "./t3team-workflowEngineBrokerContext.ts";

/** The namespace of the host's own message views (`t3team.workflow.decision`, …). */
const HOST_VIEW_NAMESPACE = "t3team";

const workflowViewMessageId = (threadId: string, key: string) =>
  `t3team-wf-view:${threadId}:${key}`;

/** Why the host refuses to show `view`, or `null` when it may. */
export function workflowShowViewProblem(view: ShowViewInput): string | null {
  const problem = showViewInputProblem(view);
  if (problem !== null) return problem;
  return showViewNamespace(view.viewId) === HOST_VIEW_NAMESPACE
    ? `viewId "${view.viewId}" is a host view; a workflow cannot post it`
    : null;
}

export async function handleBrokerShowView(
  core: BrokerCore,
  s: Pick<BrokerSend, "correlationId" | "kind">,
  input: { readonly threadId: string; readonly view: ShowViewInput },
): Promise<void> {
  const { deps, enqueueOneWay, runPrimitive, step } = core;
  const { threadId, view } = input;
  const problem = workflowShowViewProblem(view);
  if (problem !== null) throw new Error(`Invalid workflow view: ${problem}`);
  step(s.correlationId, s.kind, "completed", `Showed ${view.viewId}`, threadId);
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
}
