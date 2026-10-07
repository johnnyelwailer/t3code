import type { T3TeamPrExplainerAnchor } from "@t3tools/contracts";
import { MessageCircleQuestionIcon, MessageSquarePlusIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

import { describePrExplainerAnchor } from "./t3team-prExplainerAnchor";
import { usePrExplainerAsk } from "./t3team-prExplainerAskContext";
import type { PrExplainerAskPlacement } from "./t3team-usePrExplainerAskController";

/** Small "Ask" trigger shown on hover/focus of an askable part. */
export function PrExplainerAskButton({
  anchor,
  label = "Ask",
  variant = "ghost-muted",
  className,
}: {
  anchor: T3TeamPrExplainerAnchor;
  label?: string;
  variant?: "ghost-muted" | "outline";
  /** Placement and reveal classes for the wrapper (e.g. show on the parent group's hover). */
  className?: string;
}) {
  const ask = usePrExplainerAsk();
  if (!ask.canAsk) return null;
  return (
    <span className={cn("inline-flex", className)}>
      <Button
        variant={variant}
        size="micro"
        aria-label={`Ask about ${describePrExplainerAnchor(ask.explainer, anchor)}`}
        onClick={(event) => {
          event.stopPropagation();
          ask.openAsk(anchor, event.currentTarget);
        }}
      >
        <MessageCircleQuestionIcon />
        {label}
      </Button>
    </span>
  );
}

function clampLeft(left: number, width: number) {
  return Math.max(8, Math.min(left, width - 8 - Math.min(320, width - 16)));
}

/** The floating Ask card: a question field for one anchored spot, plus "Add to chat". */
export function PrExplainerAskCard({
  placement,
  onSubmit,
  onClose,
}: {
  placement: PrExplainerAskPlacement;
  onSubmit: (question: string) => void;
  onClose: () => void;
}) {
  const ask = usePrExplainerAsk();
  const [question, setQuestion] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const label = describePrExplainerAnchor(ask.explainer, placement.anchor);
  const quote = placement.anchor.quote.trim();

  useEffect(() => {
    cardRef.current?.querySelector("textarea")?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !cardRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const send = () => {
    if (question.trim().length > 0) onSubmit(question.trim());
  };

  return (
    <div
      ref={cardRef}
      data-pxp-ask-ui
      role="dialog"
      aria-label={`Ask about ${label}`}
      className="t3team-pxp-caption-in absolute z-30 w-[min(20rem,calc(100%-1rem))] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
      style={{ top: placement.top, left: clampLeft(placement.left, placement.containerWidth) }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
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
        </div>
        <Button variant="ghost-muted" size="icon-micro" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <Textarea
        size="compact"
        placeholder="Ask about this…"
        aria-label="Your question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <div className={cn("mt-1.5 flex items-center gap-1.5", "justify-end")}>
        {ask.canAddToChat ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => ask.addToChat(placement.anchor, question.trim())}
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

/** The chip that floats under a text selection inside the player. */
export function PrExplainerSelectionChip({
  placement,
  onOpen,
}: {
  placement: PrExplainerAskPlacement;
  onOpen: () => void;
}) {
  return (
    <div
      data-pxp-ask-ui
      className="absolute z-20"
      style={{
        top: placement.top,
        left: Math.max(8, Math.min(placement.left, placement.containerWidth - 96)),
      }}
    >
      <Button variant="outline" size="xs" onClick={onOpen} aria-label="Ask about the selection">
        <MessageCircleQuestionIcon />
        Ask
      </Button>
    </div>
  );
}
