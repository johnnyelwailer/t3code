/**
 * Outbound inter-agent message visibility (GHE #209, part 2): make the
 * SENDER's side of an inter-agent send auditable in its own timeline.
 *
 * Received messages render in the target thread (as a mailbox digest or a
 * message "sent by another agent"); the sender's transcript only carries the
 * `t3_thread_send` tool call. This module derives a subtle, factual label for
 * that work entry — "Sent message to parent" / "Sent message to «child»" —
 * from sender-side data only:
 *
 *   - the thread's V2 lineage (`subagent` parent) and the shells whose
 *     lineage names this thread as parent (its direct children, with titles),
 *   - the send call's own `threadId` argument (from the dynamic tool item's
 *     input, else from the persisted detail).
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
 * The upstream thread-send tool, with or without a provider prefix (Claude reports MCP tools as
 * `mcp__<server>__<tool>`). `\b` keeps `t3_thread_send_attachments` out.
 */
const SEND_TOOL_NAME_RE = /(^|[^\p{L}\p{N}])t3_thread_send\b/iu;

type SendEntry = Pick<
  WorkLogEntry,
  "label" | "detail" | "toolTitle" | "toolData" | "projectedItem"
>;

/** The dynamic tool item behind the entry, when the projection carried it. */
function dynamicToolItem(entry: SendEntry) {
  const item = entry.projectedItem?.item;
  return item?.type === "dynamic_tool" ? item : null;
}

/**
 * Is this work entry the agent's `t3_thread_send` tool call? Checked against
 * the structured tool name first, then the label/title/detail prefix.
 */
export function isActorOutboundSendMessageEntry(entry: SendEntry): boolean {
  const toolName = dynamicToolItem(entry)?.toolName;
  if (typeof toolName === "string") return SEND_TOOL_NAME_RE.test(toolName);
  const candidates = [entry.toolTitle, entry.label, entry.detail?.slice(0, 120)];
  return candidates.some(
    (candidate) => candidate !== undefined && candidate !== "" && SEND_TOOL_NAME_RE.test(candidate),
  );
}

/**
 * The target thread id of the send, when the persisted data carries it (the
 * structured `input.threadId`, else the `threadId` argument inside the
 * persisted detail JSON). `null` when unknown.
 */
export function extractActorOutboundTargetThreadId(entry: SendEntry): string | null {
  const input = asRecord(dynamicToolItem(entry)?.input ?? asRecord(entry.toolData)?.input);
  if (typeof input?.threadId === "string" && input.threadId.length > 0) {
    return input.threadId;
  }
  const match = /"threadId"\s*:\s*"([^"]+)"/u.exec(entry.detail ?? "");
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
  entry: SendEntry,
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
