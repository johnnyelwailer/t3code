import { useState } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Textarea } from "~/t3team/components/ui/t3team-textarea";
import { cn } from "~/t3team/lib/t3team-utils";
import { WorkItemDraftRowVerbs } from "~/t3team/workitem/t3team-WorkItemDraftRowVerbs";

export type WorkItemDraftStripRowData = {
  readonly id: string;
  readonly fieldLabel: string;
  /** Undefined falls back to `summary` — the generic path for a field kind with no from/to reader. */
  readonly changeLine?: { readonly from: string; readonly to: string } | undefined;
  readonly summary?: string | undefined;
  /** Undefined when this field kind has no accept path wired in this view yet. */
  readonly accept?: (() => void) | undefined;
  readonly pending: boolean;
  readonly highlighted: boolean;
  readonly onComment: (feedback: string) => void;
  readonly onDismiss: () => void;
  /** Document drafts only: scrolls to where the change lands and opens its own review there. */
  readonly reviewInPlace?:
    | { readonly onClick: () => void; readonly added: number; readonly removed: number }
    | undefined;
};

/**
 * One row: a scalar field resolves right here (Accept/Comment/Dismiss); a document draft
 * (description/comment) shows its magnitude and hands off to where the change actually lands —
 * prose cannot be judged from a table row.
 */
export function WorkItemDraftStripRow({ row }: { readonly row: WorkItemDraftStripRowData }) {
  const [commenting, setCommenting] = useState(false);
  const [feedback, setFeedback] = useState("");

  function sendComment() {
    const trimmed = feedback.trim();
    if (trimmed === "") return;
    row.onComment(trimmed);
    setCommenting(false);
    setFeedback("");
  }

  const proposedLabel = row.changeLine?.to ?? row.summary ?? row.fieldLabel;

  return (
    <div className={cn("px-3 py-2.5", (commenting || row.highlighted) && "bg-primary/5")}>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 shrink-0 text-muted-foreground">{row.fieldLabel}</span>

        {row.changeLine ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate text-muted-foreground line-through">{row.changeLine.from}</span>
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-medium text-foreground">{row.changeLine.to}</span>
          </span>
        ) : row.reviewInPlace ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {/*
              Added and removed are separate spans so each keeps its own colour. Joining them into
              one formatted string forced a single `text-foreground`, which made a document row the
              only place in the review where a magnitude was not colour-coded.
            */}
            <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
              {row.reviewInPlace.added > 0 ? (
                <span className="text-success-foreground">+{row.reviewInPlace.added}</span>
              ) : null}
              {row.reviewInPlace.removed > 0 ? (
                <span className="text-destructive">−{row.reviewInPlace.removed}</span>
              ) : null}
              {row.reviewInPlace.added === 0 && row.reviewInPlace.removed === 0 ? (
                <span className="text-muted-foreground">no word changes</span>
              ) : null}
            </span>
            <span className="truncate text-muted-foreground">{row.summary}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.summary}</span>
        )}

        {row.reviewInPlace ? (
          <Button size="xs" variant="ghost" className="shrink-0" onClick={row.reviewInPlace.onClick}>
            Review in place
            <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <WorkItemDraftRowVerbs
            fieldLabel={row.fieldLabel}
            proposedLabel={proposedLabel}
            pending={row.pending}
            {...(row.accept ? { accept: row.accept } : {})}
            onComment={() => setCommenting(true)}
            onDismiss={row.onDismiss}
          />
        )}
      </div>

      {commenting ? (
        <div className="mt-2 pl-[4.5rem]">
          <Textarea
            rows={2}
            autoFocus
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Tell the agent what to change — it proposes again from your note."
            className="text-xs"
            aria-label={`Comment on proposed ${row.fieldLabel}`}
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button size="xs" variant="ghost" onClick={() => setCommenting(false)}>
              Cancel
            </Button>
            <Button size="xs" disabled={feedback.trim() === ""} onClick={sendComment}>
              Send
            </Button>
          </div>
        </div>
      ) : row.summary && !row.reviewInPlace ? (
        <p className="mt-0.5 pl-[4.5rem] text-[11px] leading-4 text-muted-foreground">{row.summary}</p>
      ) : null}
    </div>
  );
}
