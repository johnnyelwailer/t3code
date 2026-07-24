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
 * @module t3team-ActorTimelineRow
 */
import { ChevronRightIcon, CornerUpRightIcon } from "lucide-react";
import type { ScopedThreadRef, ServerProviderSkill } from "@t3tools/contracts";

import ChatMarkdown from "~/components/ChatMarkdown";
import type { ChatMessage } from "~/types";
import { cn } from "~/lib/utils";

function readActorAuthor(
  message: ChatMessage,
): { threadId: string; projectId: string; title: string } | undefined {
  const author = message.t3teamExt?.author;
  return author && author.kind === "actor"
    ? { threadId: author.threadId, projectId: author.projectId, title: author.title }
    : undefined;
}

export function T3TeamActorTimelineRow(props: {
  readonly message: ChatMessage;
  readonly onOpenSenderThread?: (input: { projectId: string; threadId: string }) => void;
  readonly markdownCwd?: string;
  readonly threadRef?: ScopedThreadRef;
  readonly skills?: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
}) {
  const { message, onOpenSenderThread, markdownCwd, threadRef, skills } = props;

  const author = readActorAuthor(message);
  const actor = message.t3teamExt?.actor;
  // The real sender thread title — never a generic "another agent" placeholder.
  const senderTitle = author?.title ?? actor?.senderThreadId ?? "Peer thread";
  const senderThreadId = author?.threadId ?? actor?.senderThreadId;
  const senderProjectId = author?.projectId;
  const urgency = actor?.urgency ?? "normal";

  const summarySource =
    message.t3teamExt?.displayText && message.t3teamExt.displayText.length > 0
      ? message.t3teamExt.displayText
      : message.text;
  const normalizedPreview = summarySource.replaceAll(/\s+/g, " ").trim();
  const summary =
    normalizedPreview.length <= 120
      ? normalizedPreview
      : `${normalizedPreview.slice(0, 119).trimEnd()}…`;
  const hasBody = message.text.trim().length > 0;
  const canOpenSender =
    onOpenSenderThread !== undefined &&
    senderThreadId !== undefined &&
    senderProjectId !== undefined;

  return (
    <div className="flex flex-col items-start gap-1">
      <details className="group/actor max-w-[92%] rounded-xl border border-border/60 bg-muted/25">
        <summary className="cursor-pointer list-none px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CornerUpRightIcon className="size-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide">
              Message from <span className="font-semibold text-foreground/80">{senderTitle}</span>
            </span>
            {urgency === "urgent" ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Urgent
              </span>
            ) : null}
            <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-open/actor:rotate-90" />
          </span>
          {summary ? (
            <span className="mt-1.5 block line-clamp-2 text-sm leading-5 text-foreground/80">
              {summary}
            </span>
          ) : null}
        </summary>

        {hasBody || canOpenSender ? (
          <div className="border-t border-border/50 px-3.5 py-2.5">
            {hasBody ? (
              <ChatMarkdown
                text={message.text}
                cwd={markdownCwd}
                {...(threadRef ? { threadRef } : {})}
                {...(skills ? { skills } : {})}
                className="text-sm leading-6 text-foreground/85"
              />
            ) : null}
            {canOpenSender ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
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
              </div>
            ) : null}
          </div>
        ) : null}
      </details>
    </div>
  );
}
