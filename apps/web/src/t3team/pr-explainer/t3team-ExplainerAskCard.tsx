import {
  Button,
  MessageCircleQuestionIcon,
  MessageSquarePlusIcon,
  Popover,
  PopoverPopup,
  Textarea,
  XIcon,
} from "./t3team-explainerHostKit";
import { useRef, useState, type RefObject } from "react";

import { describeExplainerAnchor } from "./t3team-explainerAnchor";
import { useExplainer } from "./t3team-explainerContext";
import type { ExplainerAskOpen } from "./t3team-useExplainerAskController";

function AskForm({
  open,
  fieldRef,
  onSubmit,
  onClose,
}: {
  open: ExplainerAskOpen;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (question: string) => void;
  onClose: () => void;
}) {
  const api = useExplainer();
  const [question, setQuestion] = useState("");
  const label = describeExplainerAnchor(api.explainer, open.anchor);
  const quote = open.anchor.quote.trim();
  const send = () => {
    if (question.trim().length > 0) onSubmit(question.trim());
  };
  return (
    <div
      data-xp-ask-ui
      className="w-[min(20rem,calc(100vw-2rem))]"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send();
      }}
    >
      <div className="mb-1.5 flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-2xs font-medium text-muted-foreground">{label}</div>
          {quote ? (
            <div className="mt-0.5 line-clamp-2 border-l-2 border-primary/50 pl-1.5 font-mono text-2xs text-foreground/80">
              {quote}
            </div>
          ) : null}
          {api.staleSha ? (
            <div className="mt-0.5 text-2xs text-muted-foreground">
              From an older commit ({api.staleSha.slice(0, 7)})
            </div>
          ) : null}
        </div>
        <Button variant="ghost-muted" size="icon-micro" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <Textarea
        ref={fieldRef}
        size="compact"
        placeholder="Ask about this…"
        aria-label="Your question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        {api.canAddToChat ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => api.addToChat(open.anchor, question.trim())}
          >
            <MessageSquarePlusIcon />
            Add to chat
          </Button>
        ) : null}
        <Button size="xs" disabled={question.trim().length === 0} onClick={send}>
          Ask
        </Button>
      </div>
    </div>
  );
}

/**
 * The Ask card: the repo popover, pointed at the asked-about element or selection. It moves
 * with what it points at, closes on Escape or an outside press, and returns focus to its opener.
 */
export function ExplainerAskCard({
  open,
  onSubmit,
  onClose,
}: {
  open: ExplainerAskOpen | null;
  onSubmit: (question: string) => void;
  onClose: (pressTarget?: EventTarget | null) => void;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Popover
      open={open !== null}
      onOpenChange={(next, details) => {
        if (!next) onClose(details.event?.target ?? null);
      }}
    >
      {open ? (
        <PopoverPopup
          key={open.key}
          anchor={open.at}
          side="bottom"
          align="start"
          padding="compact"
          aria-label="Ask about this"
          initialFocus={fieldRef}
          // An SVG map part focuses like an element; Base UI only calls `.focus()` on it.
          finalFocus={() => (open.opener?.isConnected ? (open.opener as HTMLElement) : true)}
        >
          <AskForm open={open} fieldRef={fieldRef} onSubmit={onSubmit} onClose={() => onClose()} />
        </PopoverPopup>
      ) : null}
    </Popover>
  );
}

/** The chip that floats under a text selection inside the player. */
export function ExplainerSelectionChip({
  top,
  left,
  onOpen,
}: {
  top: number;
  left: number;
  onOpen: (opener: HTMLElement) => void;
}) {
  return (
    <div data-xp-ask-ui className="absolute z-20" style={{ top, left }}>
      <Button
        variant="outline"
        size="xs"
        onClick={(event) => onOpen(event.currentTarget)}
        aria-label="Ask about the selection"
      >
        <MessageCircleQuestionIcon />
        Ask
      </Button>
    </div>
  );
}
