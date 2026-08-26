/**
 * Outbound inter-agent message visibility (GHE #209, part 2): make the
 * SENDER's side of an inter-agent `send_message` auditable in its own
 * timeline.
 *
 * Today only RECEIVED inter-agent messages render (the `actor`-role card,
 * t3team-ActorTimelineRow.tsx); an outbound `t3team_send_message` tool call
 * from this thread's agent was invisible ("sneaky") — the message itself is
 * recorded only in the target thread, so the sender's transcript carries the
 * tool call in its work log. This module derives a subtle, factual label for
 * that work entry — "Sent message to parent" / "Sent message to «child»" —
 * from sender-side data only:
 *
 *   - the thread's `t3team.handoff.created` activity (this thread is a
 *     start-child: payload carries the parent's thread id) — same durable
 *     relation the server's findHandoffParentThreadId reads,
 *   - the thread's `t3team.handoff.started` activities (this thread's direct
 *     children: payload carries childThreadId + childTitle),
 *   - the send tool call's own persisted `to_thread_id` (from the mcp tool
 *     call's item data or its persisted detail prefix).
 *
 * Resolution is conservative: an unresolvable target renders as
 * "another thread" — never a guessed relationship.
 *
 * Pure logic (no React): the timeline wires it into the work-row label.
 *
 * @module t3team-actorOutbound
 */
import type { OrchestrationThreadActivity } from "@t3tools/contracts";

import type { WorkLogEntry } from "~/session-logic";

/** The thread relations a sender needs to name the target of a send. */
export interface ActorOutboundRelations {
  readonly parentThreadId: string | null;
  readonly childTitles: ReadonlyMap<string, string>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Derive this thread's inter-agent relations from its own durable activities.
 * Mirrors the server-side handoff-payload contract
 * (t3team-toolBrokerStartChildHandoff.ts): `t3team.handoff.created` persists
 * the child's parent id; `t3team.handoff.started` persists each direct
 * child's id + title.
 */
export function deriveActorOutboundRelations(
  activities: ReadonlyArray<OrchestrationThreadActivity> | null | undefined,
): ActorOutboundRelations {
  let parentThreadId: string | null = null;
  const childTitles = new Map<string, string>();
  if (activities === null || activities === undefined) {
    return { parentThreadId, childTitles };
  }
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i]!;
    if (activity.kind === "t3team.handoff.created" && parentThreadId === null) {
      const payload = asRecord(activity.payload);
      // Workflow-spawned children are owned by the run, not the launching
      // thread — same skip the server's findHandoffParentThreadId applies.
      if (typeof payload?.workflowRunId === "string" && payload.workflowRunId.length > 0) {
        continue;
      }
      if (typeof payload?.parentThreadId === "string" && payload.parentThreadId.length > 0) {
        parentThreadId = payload.parentThreadId;
      }
    } else if (activity.kind === "t3team.handoff.started") {
      const payload = asRecord(activity.payload);
      if (
        typeof payload?.childThreadId === "string" &&
        payload.childThreadId.length > 0 &&
        typeof payload.childTitle === "string" &&
        payload.childTitle.length > 0
      ) {
        childTitles.set(payload.childThreadId, payload.childTitle);
      }
    }
  }
  return { parentThreadId, childTitles };
}

/**
 * The tool name of the inter-agent send tool, with or without a provider
 * prefix (Claude reports MCP tools as `mcp__<server>__<tool>`).
 */
const SEND_MESSAGE_TOOL_NAME_RE = /(^|[^\p{L}\p{N}])t3team[-_]send[-_]message\b/iu;

/**
 * Is this work entry the agent's `t3team_send_message` tool call? Checked
 * against the structured item name first (when the projection carried it),
 * then the persisted label/detail prefix — the adapter persists the detail
 * as `<toolName>: <input json>`, so the tool name leads the string.
 */
export function isActorOutboundSendMessageEntry(
  entry: Pick<WorkLogEntry, "label" | "detail" | "toolTitle" | "toolData">,
): boolean {
  const item = asRecord(entry.toolData);
  if (typeof item?.name === "string" && SEND_MESSAGE_TOOL_NAME_RE.test(item.name)) {
    return true;
  }
  const candidates: string[] = [];
  if (entry.detail !== undefined && entry.detail !== null) {
    candidates.push(entry.detail.slice(0, 120));
  }
  if (entry.label) candidates.push(entry.label);
  if (entry.toolTitle) candidates.push(entry.toolTitle);
  return candidates.some(
    (candidate) => candidate !== "" && SEND_MESSAGE_TOOL_NAME_RE.test(candidate),
  );
}

/**
 * Extract the target thread id of the send, when the persisted data carries
 * it (structured `input.to_thread_id` on the item, else the `to_thread_id`
 * argument inside the persisted detail JSON). `null` when unknown.
 */
export function extractActorOutboundTargetThreadId(
  entry: Pick<WorkLogEntry, "detail" | "toolData">,
): string | null {
  const item = asRecord(entry.toolData);
  const input = asRecord(item?.input);
  if (typeof input?.to_thread_id === "string" && input.to_thread_id.length > 0) {
    return input.to_thread_id;
  }
  const match = /"to_thread_id"\s*:\s*"([^"]+)"/u.exec(entry.detail ?? "");
  return match?.[1] ?? null;
}

/**
 * The factual, subtle label for an outbound inter-agent send in the SENDER's
 * timeline, or `null` when the entry is not one. The target is named only
 * when the sender-side data proves the relation:
 *   - the target is this thread's parent → "Sent message to parent"
 *   - the target is one of this thread's direct children → "Sent message to «<title>»"
 *   - anything else / unknown → "Sent message to another thread"
 */
export function describeActorOutboundSend(
  entry: Pick<WorkLogEntry, "label" | "detail" | "toolTitle" | "toolData">,
  relations: ActorOutboundRelations,
): string | null {
  if (!isActorOutboundSendMessageEntry(entry)) {
    return null;
  }
  const targetId = extractActorOutboundTargetThreadId(entry);
  if (
    targetId !== null &&
    relations.parentThreadId !== null &&
    targetId === relations.parentThreadId
  ) {
    return "Sent message to parent";
  }
  if (targetId !== null) {
    const childTitle = relations.childTitles.get(targetId);
    if (childTitle !== undefined) {
      return `Sent message to «${childTitle}»`;
    }
  }
  return "Sent message to another thread";
}
