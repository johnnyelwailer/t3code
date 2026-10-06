import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { useMemo } from "react";

import type { WorkLogEntry } from "~/session-logic";
import { useThreadShell } from "~/state/entities";
import {
  describeActorOutboundSend,
  deriveActorOutboundRelations,
  extractActorOutboundTargetThreadId,
  isActorOutboundSendMessageEntry,
} from "~/t3team/chat/t3team-actorOutbound";

/**
 * GHE #209: the sender-side label of a `t3_thread_send` work row ("Sent message to parent" /
 * "to «child»"), or null for any other row. Reads only the two shells it needs — this thread's
 * (its lineage parent) and the target's (is it a direct child, and its title).
 */
export function useT3TeamOutboundSendLabel(
  entry: WorkLogEntry,
  threadRef: ScopedThreadRef | null,
): string | null {
  const isSend = isActorOutboundSendMessageEntry(entry);
  const targetId = isSend ? extractActorOutboundTargetThreadId(entry) : null;
  const targetRef = useMemo(
    () =>
      threadRef !== null && targetId !== null
        ? scopeThreadRef(threadRef.environmentId, ThreadId.make(targetId))
        : null,
    [targetId, threadRef],
  );
  const sender = useThreadShell(isSend ? threadRef : null);
  const target = useThreadShell(targetRef);
  return useMemo(
    () =>
      isSend
        ? describeActorOutboundSend(
            entry,
            deriveActorOutboundRelations({ thread: sender, threads: target ? [target] : [] }),
          )
        : null,
    [entry, isSend, sender, target],
  );
}
