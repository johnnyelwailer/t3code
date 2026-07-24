/**
 * Compose the provider-facing text of a workflow-engine agent turn (`thread.turn`).
 *
 * The SDK keeps a `thread.turn` payload's attachments as STRUCTURE (author objects, named,
 * journaled as data — see `t3work-sdk.askAttachments.ts`); the single place they become text is
 * here, when the host dispatches the turn to the provider. That split is what lets a workflow
 * author write `agent("Judge these gates", { attachments: [gates] })` and never stringify or
 * inline data into a prompt (PR review: "never inline any data. Always as attachments").
 *
 * Rendering is NOT journaled — it happens after the journaled `sent` entry — so the composed
 * string has no bearing on replay determinism; the payload (and its argsHash) is the record.
 */

import { asNamedAttachments, renderAgentAttachments } from "@t3work/sdk";

import type { ThreadTurnPayload } from "./t3work-workflowEngineBrokerTypes.ts";

export function workflowTurnText(payload: ThreadTurnPayload): string {
  return `${payload.prompt}${renderAgentAttachments(asNamedAttachments(payload.attachments))}`;
}
