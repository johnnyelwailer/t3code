/**
 * Joins a thread's fork artifacts onto its V2 timeline entries.
 *
 * - A `message-ext` / `widget` artifact keyed to a message merges into that message's
 *   `t3teamExt` (after the ext its own context carries), so the rich row router renders it.
 * - A fork recorder note (`system` message, see `t3team-recorderNote.ts`) carries its small ext
 *   fields (author, status, visibility) on its V2 message context, read from the projection.
 * - An artifact with no message (a bare widget, a text-less workflow card) becomes a `system`
 *   message entry of its own at its `createdAt`.
 * - Activity artifacts (`t3team.*`) become the thread's activity records (workflow step pips).
 *
 * Unchanged entries keep their identity, and a decorated message is rebuilt only when one of its
 * inputs changes identity, so streaming updates keep memoized timeline rows mounted.
 */
import {
  MessageId,
  type OrchestrationMessageContext,
  type T3TeamMessageExt,
  type T3TeamThreadArtifact,
} from "@t3tools/contracts";

import type { TimelineEntry } from "~/session-logic";
import type { ChatMessage } from "~/types";
import {
  artifactMessageExt,
  artifactThreadActivity,
  mergeT3TeamMessageExts,
} from "~/t3team/chat/t3team-artifactMessageExt";
import { t3teamMessageExtOf } from "~/t3team/chat/t3team-messageFraming";
import type { T3TeamThreadActivityRecord } from "~/t3team/chat/t3team-threadActivityRecord";

type MessageEntry = Extract<TimelineEntry, { kind: "message" }>;

interface DecoratedEntry {
  readonly inputs: ReadonlyArray<T3TeamMessageExt | undefined>;
  readonly entry: MessageEntry;
}

const decoratedByEntry = new WeakMap<MessageEntry, DecoratedEntry>();
const standaloneByArtifact = new WeakMap<T3TeamThreadArtifact, MessageEntry>();

const sameInputs = (
  left: ReadonlyArray<T3TeamMessageExt | undefined>,
  right: ReadonlyArray<T3TeamMessageExt | undefined>,
) => left.length === right.length && left.every((value, index) => value === right[index]);

function decorateMessageEntry(
  entry: MessageEntry,
  inputs: ReadonlyArray<T3TeamMessageExt | undefined>,
): MessageEntry {
  const cached = decoratedByEntry.get(entry);
  if (cached !== undefined && sameInputs(cached.inputs, inputs)) return cached.entry;
  const t3teamExt = mergeT3TeamMessageExts(inputs);
  const message: ChatMessage =
    t3teamExt === undefined ? entry.message : { ...entry.message, t3teamExt };
  const decorated = message === entry.message ? entry : { ...entry, message };
  decoratedByEntry.set(entry, { inputs, entry: decorated });
  return decorated;
}

function standaloneEntry(artifact: T3TeamThreadArtifact, ext: T3TeamMessageExt): MessageEntry {
  const cached = standaloneByArtifact.get(artifact);
  if (cached !== undefined) return cached;
  const id = MessageId.make(artifact.id);
  const entry: MessageEntry = {
    id,
    kind: "message",
    createdAt: artifact.createdAt,
    message: {
      id,
      role: "system",
      text: "",
      runId: null,
      streaming: false,
      createdBy: "system",
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
      t3teamExt: ext,
    },
  };
  standaloneByArtifact.set(artifact, entry);
  return entry;
}

function insertByCreatedAt(entries: TimelineEntry[], entry: TimelineEntry) {
  const index = entries.findIndex((candidate) => candidate.createdAt > entry.createdAt);
  if (index === -1) entries.push(entry);
  else entries.splice(index, 0, entry);
}

export function decorateT3TeamTimelineEntries(input: {
  readonly entries: ReadonlyArray<TimelineEntry>;
  readonly artifacts: ReadonlyArray<T3TeamThreadArtifact>;
  /** V2 message contexts by message id (projection messages): recorder notes' ext. */
  readonly contextByMessageId: ReadonlyMap<string, OrchestrationMessageContext>;
}): ReadonlyArray<TimelineEntry> {
  const extsByMessageId = new Map<string, T3TeamMessageExt[]>();
  const standalone: Array<{ artifact: T3TeamThreadArtifact; ext: T3TeamMessageExt }> = [];
  for (const artifact of input.artifacts) {
    const ext = artifactMessageExt(artifact);
    if (ext === null) continue;
    if (artifact.messageId === null) {
      standalone.push({ artifact, ext });
      continue;
    }
    const exts = extsByMessageId.get(artifact.messageId);
    if (exts === undefined) extsByMessageId.set(artifact.messageId, [ext]);
    else exts.push(ext);
  }
  const hasRecorderNotes = input.entries.some(
    (entry) => entry.kind === "message" && entry.message.role === "system",
  );
  if (extsByMessageId.size === 0 && standalone.length === 0 && !hasRecorderNotes) {
    return input.entries;
  }

  const entries: TimelineEntry[] = input.entries.map((entry) => {
    if (entry.kind !== "message") return entry;
    const artifactExts = extsByMessageId.get(entry.message.id);
    const contextExt =
      entry.message.role === "system"
        ? t3teamMessageExtOf({ context: input.contextByMessageId.get(entry.message.id) }).t3teamExt
        : undefined;
    if (artifactExts === undefined && contextExt === undefined) return entry;
    return decorateMessageEntry(entry, [
      entry.message.t3teamExt,
      contextExt,
      ...(artifactExts ?? []),
    ]);
  });
  for (const { artifact, ext } of standalone) {
    insertByCreatedAt(entries, standaloneEntry(artifact, ext));
  }
  return entries;
}

/** The thread's fork activity records (workflow steps, recipe launches) from its artifacts. */
export function t3teamThreadActivitiesOf(
  artifacts: ReadonlyArray<T3TeamThreadArtifact>,
): ReadonlyArray<T3TeamThreadActivityRecord> {
  return artifacts.flatMap((artifact) => {
    const activity = artifactThreadActivity(artifact);
    return activity === null ? [] : [activity];
  });
}
