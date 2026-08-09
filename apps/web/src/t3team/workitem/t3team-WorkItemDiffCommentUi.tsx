import { useEffect, useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";
import { T3TeamCommentPopoutCard } from "~/t3team/workitem/t3team-CommentPopoutCard";
import type { T3TeamDiffComment } from "~/t3team/workitem/t3team-workItemDiffCommentList";

const COMPOSER_WIDTH_PX = 288;

/** Blocks announce themselves so a selection can be traced back to what it belongs to. */
export const DIFF_BLOCK_ATTRIBUTE = "data-diff-block";

function blockIdFromNode(node: Node | null): string | undefined {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  const host = element?.closest(`[${DIFF_BLOCK_ATTRIBUTE}]`);
  return host?.getAttribute(DIFF_BLOCK_ATTRIBUTE) ?? undefined;
}

type Anchor = {
  readonly top: number;
  readonly left: number;
  readonly quote: string;
  readonly blockId: string;
};

/**
 * Turns any text selection inside the document into a place to leave feedback.
 *
 * Document-level review is too blunt for prose — "this clause is wrong" has to point at the clause.
 */
export function T3TeamDiffSelectionComposer({
  containerRef,
  onSubmit,
}: {
  readonly containerRef: React.RefObject<HTMLElement | null>;
  readonly onSubmit: (input: { blockId: string; quote: string; body: string }) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | undefined>(undefined);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const onMouseUp = () => {
      const container = containerRef.current;
      if (!container) return;
      /* Clicking into the textarea collapses the selection; that must not close the composer. */
      if (composing) return;

      const selection = window.getSelection();
      const quote = selection?.toString().trim() ?? "";
      if (!selection || selection.isCollapsed || quote === "") {
        setAnchor(undefined);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;
      const blockId = blockIdFromNode(range.commonAncestorContainer);
      if (blockId === undefined) return;

      const rect = range.getBoundingClientRect();
      const base = container.getBoundingClientRect();
      setAnchor({
        top: rect.bottom - base.top + 6,
        /* Clamp, or a selection near the right margin opens a composer half outside the panel. */
        left: Math.max(0, Math.min(rect.left - base.left, base.width - COMPOSER_WIDTH_PX)),
        quote,
        blockId,
      });
    };

    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [containerRef, composing]);

  if (!anchor) return null;

  const close = () => {
    setAnchor(undefined);
    setComposing(false);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      className="absolute z-20 w-72 max-w-[calc(100%-1rem)]"
      style={{ top: anchor.top, left: anchor.left }}
    >
      {composing ? (
        <T3TeamCommentPopoutCard
          quote={anchor.quote}
          onCancel={close}
          onSubmit={(body) => {
            onSubmit({ blockId: anchor.blockId, quote: anchor.quote, body });
            close();
          }}
        />
      ) : (
        <Button size="xs" onClick={() => setComposing(true)}>
          <MessageSquarePlus className="size-3.5" />
          Comment on selection
        </Button>
      )}
    </div>
  );
}

/** The comments left against one block, shown under it rather than in a side rail. */
export function T3TeamDiffCommentThread({
  comments,
  onRemove,
  className,
}: {
  readonly comments: ReadonlyArray<T3TeamDiffComment>;
  readonly onRemove: (id: string) => void;
  readonly className?: string;
}) {
  if (comments.length === 0) return null;

  return (
    <div className={cn("mt-1.5 space-y-1.5", className)}>
      {comments.map((comment) => (
        <div
          key={comment.id}
          className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate border-l-2 border-primary/50 pl-2 text-[11px] italic text-muted-foreground">
              {comment.quote}
            </p>
            <p className="mt-1 text-xs leading-5 text-foreground">{comment.body}</p>
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Remove comment"
            onClick={() => onRemove(comment.id)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
