import type { T3TeamExplainerAskThread } from "./model/t3team-explainer";
import {
  Button,
  ChevronRightIcon,
  MessageSquarePlusIcon,
  ReplyIcon,
  SparklesIcon,
  Spinner,
  cn,
} from "./t3team-explainerHostKit";
import {
  describeExplainerAnchor,
  explainerAnchorKey,
  explainerAnchorSection,
  type ExplainerAnchorSection,
} from "./t3team-explainerAnchor";
import { useExplainer } from "./t3team-explainerContext";

/** The current threads on one step section. */
export function useExplainerSectionThreads(stepId: string, section: ExplainerAnchorSection) {
  const { threads } = useExplainer();
  return threads.filter(
    (thread) =>
      thread.anchor.stepId === stepId && explainerAnchorSection(thread.anchor) === section,
  );
}

function ThreadCard({
  thread,
  outdated = false,
}: {
  thread: T3TeamExplainerAskThread;
  outdated?: boolean;
}) {
  const api = useExplainer();
  const label = describeExplainerAnchor(api.explainer, thread.anchor);
  const target = thread.anchor.target.kind;
  const showQuote = target === "captionText" || target === "blockText" || target === "caption";
  return (
    <article
      aria-label={`Thread on ${label}`}
      data-xp-thread
      className={cn(
        "t3team-xp-stream-in rounded-lg border border-border/80 bg-background/80 px-2.5 py-2 font-sans text-xs",
        api.activeKey === explainerAnchorKey(thread.anchor) && "border-primary/50",
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
            <p
              className={cn(
                "min-w-0 flex-1 whitespace-pre-wrap leading-relaxed",
                message.author === "reader" ? "font-medium text-foreground" : "text-foreground/90",
              )}
            >
              <span className="sr-only">{message.author === "agent" ? "Agent:" : "You:"}</span>
              {message.body}
              {message.status === "streaming" ? (
                <Spinner size="xs" aria-label="Answer in progress" className="ml-1 inline" />
              ) : null}
            </p>
          </li>
        ))}
      </ol>
      {outdated ? null : (
        <footer className="mt-1.5 flex justify-end gap-1">
          {api.canAsk ? (
            <Button
              variant="ghost-muted"
              size="micro"
              onClick={(event) =>
                api.openAsk(thread.anchor, event.currentTarget, event.currentTarget)
              }
            >
              <ReplyIcon />
              Reply
            </Button>
          ) : null}
          {api.canAddToChat ? (
            <Button variant="ghost-muted" size="micro" onClick={() => api.addToChat(thread.anchor)}>
              <MessageSquarePlusIcon />
              Add to chat
            </Button>
          ) : null}
        </footer>
      )}
    </article>
  );
}

/** Inline comment threads anchored to one spot of the explainer. */
export function ExplainerAskThreads({
  threads,
  className,
}: {
  threads: ReadonlyArray<T3TeamExplainerAskThread>;
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

/**
 * Threads that no longer point at anything shown — another revision, or a step or block that
 * is gone. Folded under one line so they never vanish and never land on the wrong spot.
 */
export function ExplainerOutdatedThreads({
  threads,
}: {
  threads: ReadonlyArray<T3TeamExplainerAskThread>;
}) {
  if (threads.length === 0) return null;
  return (
    <details className="group/outdated text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-2xs text-muted-foreground hover:text-foreground">
        <ChevronRightIcon aria-hidden className="size-3 group-open/outdated:rotate-90" />
        {threads.length} outdated {threads.length === 1 ? "question" : "questions"}
      </summary>
      <div className="mt-1.5 space-y-1.5 opacity-80">
        {threads.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} outdated />
        ))}
      </div>
    </details>
  );
}
