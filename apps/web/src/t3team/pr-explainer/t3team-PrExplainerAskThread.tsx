import type { T3TeamPrExplainerAskThread } from "@t3tools/contracts";
import { MessageSquarePlusIcon, ReplyIcon, SparklesIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

import {
  describePrExplainerAnchor,
  prExplainerAnchorKey,
  prExplainerAnchorSection,
  type PrExplainerAnchorSection,
} from "./t3team-prExplainerAnchor";
import { usePrExplainerAsk } from "./t3team-prExplainerAskContext";

/** The threads on one step section, optionally narrowed to a diff line the thread ends at. */
export function usePrExplainerSectionThreads(
  stepId: string,
  section: PrExplainerAnchorSection,
  match?: (thread: T3TeamPrExplainerAskThread) => boolean,
) {
  const { threads } = usePrExplainerAsk();
  return threads.filter(
    (thread) =>
      thread.anchor.stepId === stepId &&
      prExplainerAnchorSection(thread.anchor) === section &&
      (match ? match(thread) : true),
  );
}

function ThreadCard({ thread }: { thread: T3TeamPrExplainerAskThread }) {
  const ask = usePrExplainerAsk();
  const label = describePrExplainerAnchor(ask.explainer, thread.anchor);
  const showQuote =
    thread.anchor.target.kind === "textSelection" || thread.anchor.target.kind === "caption";
  return (
    <article
      aria-label={`Thread on ${label}`}
      className={cn(
        "t3team-pxp-stream-in rounded-lg border border-border/80 bg-background/80 px-2.5 py-2 font-sans text-xs",
        ask.activeKey === prExplainerAnchorKey(thread.anchor) && "border-primary/50",
      )}
    >
      <header className="mb-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
        <span className="truncate font-medium">{label}</span>
        {showQuote && thread.anchor.quote ? (
          <span className="min-w-0 truncate italic">“{thread.anchor.quote}”</span>
        ) : null}
      </header>
      <ol className="space-y-1.5">
        {thread.messages.map((message) => (
          <li key={message.id} className="flex gap-1.5">
            {message.author === "agent" ? (
              <SparklesIcon aria-hidden className="mt-0.5 size-3 shrink-0 text-primary" />
            ) : (
              <span aria-hidden className="mt-0.5 size-3 shrink-0 rounded-full bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <span className="sr-only">{message.author === "agent" ? "Agent:" : "You:"}</span>
              <p
                className={cn(
                  "whitespace-pre-wrap leading-relaxed",
                  message.author === "reader"
                    ? "font-medium text-foreground"
                    : "text-foreground/90",
                )}
              >
                {message.body}
                {message.status === "streaming" ? (
                  <span className="ml-1 inline-flex translate-y-0.5 items-center gap-1 text-muted-foreground">
                    <Spinner size="xs" aria-label="Answer in progress" />
                  </span>
                ) : null}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <footer className="mt-1.5 flex justify-end gap-1">
        {ask.canAsk ? (
          <Button
            variant="ghost-muted"
            size="micro"
            onClick={(event) => ask.openAsk(thread.anchor, event.currentTarget)}
          >
            <ReplyIcon />
            Reply
          </Button>
        ) : null}
        {ask.canAddToChat ? (
          <Button variant="ghost-muted" size="micro" onClick={() => ask.addToChat(thread.anchor)}>
            <MessageSquarePlusIcon />
            Add to chat
          </Button>
        ) : null}
      </footer>
    </article>
  );
}

/** Inline comment threads anchored to one spot of the explainer. */
export function PrExplainerAskThreads({
  threads,
  className,
}: {
  threads: ReadonlyArray<T3TeamPrExplainerAskThread>;
  className?: string;
}) {
  if (threads.length === 0) return null;
  return (
    <div className={cn("space-y-1.5", className)}>
      {threads.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} />
      ))}
    </div>
  );
}
