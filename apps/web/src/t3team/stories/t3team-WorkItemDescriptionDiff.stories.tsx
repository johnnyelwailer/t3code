import { Bot, Check, MessageSquare, X } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";
import {
  T3TeamDiffBlock,
  T3TeamDiffText,
  type T3TeamDiffSegment,
} from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";

/**
 * Reviewing a proposed description where it lives.
 *
 * The existing `DraftDocumentCompare` shows a monospace `+`/`-` line diff. That is a diff for
 * engineers reading a patch, not for someone deciding whether an acceptance criterion now says the
 * right thing — it discards the formatting the description is written in, and a reflowed paragraph
 * shows up as one whole line removed and one whole line added even when a single number changed.
 *
 * So the diff renders as the description itself: real headings, real lists, in place. Removed text
 * is struck through, added text is tinted, and changed blocks carry a gutter bar so you can find
 * them without reading everything. What you are looking at is the proposed document, with its
 * history visible — accept and the marks simply resolve away.
 */

type Segment = T3TeamDiffSegment;

function ReviewBar() {
  return (
    <div className="sticky top-0 z-10 -mx-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 bg-background/95 px-3 py-2 backdrop-blur">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Bot className="size-3.5 text-primary" aria-hidden="true" />
        Proposed rewrite
      </span>
      <span className="flex items-center gap-2 text-xs tabular-nums">
        <span className="text-success-foreground">+12</span>
        <span className="text-destructive">−3</span>
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Button size="xs" variant="ghost">
          <MessageSquare className="size-3.5" />
          Comment
        </Button>
        <Button size="xs" variant="ghost">
          <X className="size-3.5" />
          Dismiss
        </Button>
        <Button size="xs">
          <Check className="size-3.5" />
          Accept
        </Button>
      </span>
    </div>
  );
}

/*
  Hand-authored segments. The real thing derives these from the two ADF documents — this exists to
  settle what the result should look like before the diffing is written against it.
*/
const INTRO: ReadonlyArray<Segment> = [
  { text: "The bulk importer reads a supplier catalogue and writes it into the staging table. It " },
  { text: "should", kind: "del" },
  { text: "must", kind: "add" },
  { text: " handle " },
  { text: "CSV", kind: "del" },
  { text: "CSV and TSV", kind: "add" },
  { text: " files up to " },
  { text: "50", kind: "del" },
  { text: "200", kind: "add" },
  { text: " MB and report progress every " },
  { text: "5", kind: "del" },
  { text: "2", kind: "add" },
  { text: " seconds." },
];

const CRITERIA: ReadonlyArray<{
  readonly text: string;
  readonly kind?: "add" | "del";
}> = [
  { text: "A malformed row is skipped and counted, never aborting the run." },
  { text: "Progress is visible while the import is still running." },
  { text: "Duplicate SKUs within one file resolve to the last occurrence.", kind: "add" },
  { text: "A cancelled import leaves no partial rows in staging.", kind: "add" },
  { text: "The importer retries a failed row three times before skipping it.", kind: "add" },
];

function ProposedDescription() {
  return (
    <div className="px-3 pb-4">
      <ReviewBar />

      <div className="space-y-3 text-sm leading-6 text-foreground">
        <T3TeamDiffBlock kind="edit">
          <p>
            <T3TeamDiffText segments={INTRO} />
          </p>
        </T3TeamDiffBlock>

        <T3TeamDiffBlock kind="del">
          <p className="text-muted-foreground">
            <del className="decoration-destructive/60">
              Performance targets are TBD and will be agreed with the platform team.
            </del>
          </p>
        </T3TeamDiffBlock>

        <h3 className="pt-1 text-sm font-semibold text-foreground">Acceptance criteria</h3>

        <ul className="space-y-1.5">
          {CRITERIA.map((item) => (
            <li key={item.text} className="list-none">
              <T3TeamDiffBlock {...(item.kind ? { kind: item.kind } : {})}>
                <span className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-[0.6875rem] size-1.5 shrink-0 rounded-full bg-muted-foreground/70"
                  />
                  <span
                    className={cn(
                      item.kind === "add" ? "rounded-[3px] bg-success/15 px-1" : undefined,
                    )}
                  >
                    {item.text}
                  </span>
                </span>
              </T3TeamDiffBlock>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Description Diff",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ProposedRewrite: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl">
      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        What “Review in place” opens: the description section itself, in review mode. Removed text is
        struck through, added text tinted, changed blocks marked in the gutter. The bar stays put
        while you scroll a long description.
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <ProposedDescription />
      </div>
    </div>
  ),
};
