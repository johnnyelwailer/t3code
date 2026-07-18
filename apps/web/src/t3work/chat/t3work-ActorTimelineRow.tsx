/**
 * Timeline card for a first-class inter-agent ("actor") message.
 *
 * An `actor`-role message is a message from a *peer agent thread*, not from the
 * human user and not a `system` note. It renders as a subtle FYI card (this is
 * information, not an alert): a human-readable summary, the *real* sending
 * thread's title, a click-through to open the sender's thread, and an
 * expandable disclosure for the full agent-facing text.
 *
 * Presentational only — navigation is injected as `onOpenSenderThread` so this
 * component stays router-agnostic (wired from MessagesTimeline via row context,
 * mirroring the workflow-decision card). It never calls `useNavigate` itself.
 *
 * @module t3work-ActorTimelineRow
 */
import { useState } from "react";
import { CornerUpRightIcon } from "lucide-react";

import type { ChatMessage } from "~/types";
import { cn } from "~/lib/utils";

function readActorAuthor(
  message: ChatMessage,
): { threadId: string; projectId: string; title: string } | undefined {
  const author = message.t3workExt?.author;
  return author && author.kind === "actor"
    ? { threadId: author.threadId, projectId: author.projectId, title: author.title }
    : undefined;
}

export function T3workActorTimelineRow(props: {
  readonly message: ChatMessage;
  readonly onOpenSenderThread?: (input: { projectId: string; threadId: string }) => void;
}) {
  const { message, onOpenSenderThread } = props;
  const [expanded, setExpanded] = useState(false);

  const author = readActorAuthor(message);
  const actor = message.t3workExt?.actor;
  // The real sender thread title — never a generic "another agent" placeholder.
  const senderTitle = author?.title ?? actor?.senderThreadId ?? "Peer thread";
  const senderThreadId = author?.threadId ?? actor?.senderThreadId;
  const senderProjectId = author?.projectId;
  const urgency = actor?.urgency ?? "normal";

  const summary =
    message.t3workExt?.displayText && message.t3workExt.displayText.length > 0
      ? message.t3workExt.displayText
      : message.text;
  const hasMoreDetail = summary.trim() !== message.text.trim() && message.text.length > 0;
  const canOpenSender =
    onOpenSenderThread !== undefined &&
    senderThreadId !== undefined &&
    senderProjectId !== undefined;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[92%] rounded-xl border border-border/60 bg-muted/25 px-3.5 py-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
          <CornerUpRightIcon className="size-3.5 shrink-0 opacity-70" />
          <p className="text-[11px] font-medium uppercase tracking-wide">
            Message from{" "}
            <span className="font-semibold text-foreground/80">{senderTitle}</span>
          </p>
          {urgency === "urgent" ? (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Urgent
            </span>
          ) : null}
        </div>

        {summary.length > 0 ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{summary}</p>
        ) : null}

        {hasMoreDetail && expanded ? (
          <p className="mt-2.5 whitespace-pre-wrap border-t border-border/50 pt-2.5 text-sm leading-6 text-muted-foreground">
            {message.text}
          </p>
        ) : null}

        {canOpenSender || hasMoreDetail ? (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {canOpenSender ? (
              <button
                type="button"
                className={cn(
                  "text-xs font-medium text-muted-foreground underline-offset-2",
                  "transition-colors hover:text-foreground hover:underline",
                )}
                onClick={() =>
                  onOpenSenderThread({ projectId: senderProjectId, threadId: senderThreadId })
                }
              >
                Open sender thread
              </button>
            ) : null}
            {hasMoreDetail ? (
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Hide detail" : "Show full detail"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
