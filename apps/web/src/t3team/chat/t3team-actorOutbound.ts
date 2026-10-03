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
 *   - the thread's V2 lineage (`subagent` parent) and the live shells whose
 *     lineage names this thread as parent (its direct children, with titles),
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
import type { WorkLogEntry } from "~/session-logic";
import type { ThreadShell } from "~/types";

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

type RelationShell = Pick<ThreadShell, "id" | "title" | "lineage">;

const subagentParentOf = (thread: RelationShell): string | null =>
  thread.lineage.relationshipToParent === "subagent" ? thread.lineage.parentThreadId : null;

/**
 * Derive a thread's inter-agent relations from V2 lineage: its own `subagent` parent and the live
 * shells that name it as their `subagent` parent (its direct children, by title).
 */
export function deriveActorOutboundRelations(input: {
  readonly thread: RelationShell | null | undefined;
  readonly threads: ReadonlyArray<RelationShell>;
}): ActorOutboundRelations {
  const childTitles = new Map<string, string>();
  const thread = input.thread;
  if (!thread) {
    return { parentThreadId: null, childTitles };
  }
  for (const candidate of input.threads) {
    if (subagentParentOf(candidate) === thread.id) {
      childTitles.set(candidate.id, candidate.title);
    }
  }
  return { parentThreadId: subagentParentOf(thread), childTitles };
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
