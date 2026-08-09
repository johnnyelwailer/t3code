import { useRef, useState } from "react";
import { Bot, Check, Film, Image as ImageIcon, MessageSquare, X } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";
import {
  T3TeamDiffGutter,
  T3TeamDiffRibbon,
  T3TeamDiffText,
} from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";
import {
  DIFF_BLOCK_ATTRIBUTE,
  T3TeamDiffCommentThread,
  T3TeamDiffSelectionComposer,
} from "~/t3team/workitem/t3team-WorkItemDiffCommentUi";
import { applyCommentQuotes } from "~/t3team/workitem/t3team-workItemDiffModel";
import { useWorkItemDiffComments } from "~/t3team/workitem/t3team-useWorkItemDiffComments";
import {
  DIFF_SAMPLE_BLOCKS,
  DIFF_SAMPLE_HIDDEN,
  type DiffSampleBlock,
} from "~/t3team/stories/t3team-workItemDiffSampleContent";

/**
 * A proposed description, reviewed in place, on content that is not just prose.
 *
 * Two layers sit over the same document and must never be confused with each other: what the agent
 * changed, and what a reader said about it. The separation is structural — **every mark the review
 * makes lives in the left rail or as an overlay; the content column holds content and inline text
 * marks only.** Earlier this used pill-shaped tags under each image, which read as captions and sat
 * inches from real Jira status lozenges that genuinely are part of the document.
 */

function MediaThumb({
  label,
  kind,
  state,
}: {
  readonly label: string;
  readonly kind: "image" | "video";
  readonly state?: "add" | "del" | "edit";
}) {
  const Icon = kind === "image" ? ImageIcon : Film;

  return (
    <figure className="w-48 shrink-0">
      <div className="relative overflow-hidden rounded-md border border-border bg-muted/40">
        {state ? (
          <T3TeamDiffRibbon kind={state}>
            {state === "add" ? "Added" : state === "del" ? "Removed" : "Replaced"}
          </T3TeamDiffRibbon>
        ) : null}
        {/* Dim the media, never the ribbon — chrome that fades reads as disabled, not as a label. */}
        <div
          className={cn(
            "flex h-24 items-center justify-center",
            state === "del" && "opacity-50 grayscale",
          )}
        >
          <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function BlockBody({
  block,
  quotes,
}: {
  readonly block: DiffSampleBlock;
  readonly quotes: ReadonlyArray<string>;
}) {
  switch (block.type) {
    case "heading":
      return <h3 className="text-sm font-semibold text-foreground">{block.text}</h3>;

    case "paragraph":
      return (
        <p>
          <T3TeamDiffText segments={applyCommentQuotes(block.segments, quotes)} />
        </p>
      );

    case "bullet":
      return (
        <div className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="mt-[0.6875rem] size-1.5 shrink-0 rounded-full bg-muted-foreground/70"
          />
          <span>
            <T3TeamDiffText segments={applyCommentQuotes(block.segments, quotes)} />
          </span>
        </div>
      );

    case "panel":
      return (
        <div className="rounded-md border-l-2 border-info bg-info/8 px-3 py-2">
          <p className="text-[0.8125rem] leading-6">
            <T3TeamDiffText segments={applyCommentQuotes(block.segments, quotes)} />
          </p>
        </div>
      );

    case "lozenges":
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{block.label}</span>
          <Badge variant="secondary" className="line-through opacity-70">
            {block.from}
          </Badge>
          <Badge variant="success">{block.to}</Badge>
        </div>
      );

    case "media":
      return (
        <div className="flex flex-wrap items-start gap-3">
          {block.items.map((item) => (
            <MediaThumb
              key={item.label}
              label={item.label}
              kind={item.kind}
              {...(item.state ? { state: item.state } : {})}
            />
          ))}
        </div>
      );

    case "code":
      return (
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 py-1.5 text-xs leading-5">
          {block.lines.map((line) => (
            <div
              key={`${line.state ?? "same"}:${line.text}`}
              className={cn(
                "flex gap-1.5 px-2",
                line.state === "add" && "bg-success/10",
                line.state === "del" && "bg-destructive/10",
              )}
            >
              <span
                className={cn(
                  "w-3 shrink-0 select-none text-right font-mono",
                  line.state === "add" && "text-success-foreground",
                  line.state === "del" && "text-destructive",
                  !line.state && "text-muted-foreground/50",
                )}
              >
                {line.state === "add" ? "+" : line.state === "del" ? "−" : ""}
              </span>
              <code className="whitespace-pre font-mono text-foreground">{line.text}</code>
            </div>
          ))}
        </pre>
      );

    case "table":
      return (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {block.columns.map((column) => (
                  <th key={column} className="px-2.5 py-1.5 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {block.rows.map((row) => (
                <tr
                  key={row.cells[0]?.[0]?.text ?? ""}
                  className={cn(row.state === "add" && "bg-success/5")}
                >
                  {row.cells.map((cell, cellIndex) => (
                    <td key={`${block.columns[cellIndex] ?? cellIndex}`} className="px-2.5 py-1.5">
                      {cellIndex === 0 && row.state === "add" ? (
                        <span className="-ml-1.5 mr-1 select-none font-mono text-success-foreground">
                          +
                        </span>
                      ) : null}
                      <T3TeamDiffText segments={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "embed":
      return (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {block.label}
          <span className="text-[11px] italic">
            changed — this node type cannot be compared field by field
          </span>
        </div>
      );
  }
}

function ReviewBar({ commentCount }: { readonly commentCount: number }) {
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Bot className="size-3.5 text-primary" aria-hidden="true" />
        Proposed rewrite
      </span>
      <span className="flex items-center gap-2 text-xs tabular-nums">
        <span className="text-success-foreground">+18</span>
        <span className="text-destructive">−6</span>
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Button size="xs" variant="ghost">
          <MessageSquare className="size-3.5" />
          {commentCount > 0 ? `Send ${commentCount} back` : "Comment"}
        </Button>
        <Button size="xs" variant="ghost">
          <X className="size-3.5" />
          Dismiss
        </Button>
        <Button size="xs" disabled={commentCount > 0}>
          <Check className="size-3.5" />
          Accept
        </Button>
      </span>
    </div>
  );
}

function RichDiff() {
  const containerRef = useRef<HTMLDivElement>(null);
  const comments = useWorkItemDiffComments();
  const [expanded, setExpanded] = useState(false);

  const renderBlock = (block: DiffSampleBlock) => {
    const blockComments = comments.forBlock(block.id);

    return (
      <div key={block.id} className="group flex">
        <T3TeamDiffGutter
          {...(block.state ? { state: block.state } : {})}
          commentCount={blockComments.length}
        />
        <div className="min-w-0 flex-1" {...{ [DIFF_BLOCK_ATTRIBUTE]: block.id }}>
          <div
            className={cn(
              "-ml-2 border-l-2 py-0.5 pl-2",
              block.state === "add" && "border-success/60 bg-success/5",
              block.state === "del" && "border-destructive/60 bg-destructive/5",
              block.state === "edit" && "border-primary/50",
              !block.state && "border-transparent",
            )}
          >
            <BlockBody block={block} quotes={comments.quotesForBlock(block.id)} />
          </div>
          <T3TeamDiffCommentThread comments={blockComments} onRemove={comments.remove} />
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <ReviewBar commentCount={comments.total} />
      <T3TeamDiffSelectionComposer containerRef={containerRef} onSubmit={comments.add} />

      <div className="space-y-2.5 px-3 py-3 text-sm leading-6 text-foreground">
        {DIFF_SAMPLE_BLOCKS.slice(0, 2).map(renderBlock)}

        {expanded ? (
          DIFF_SAMPLE_HIDDEN.map(renderBlock)
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-9 flex w-[calc(100%-2.25rem)] cursor-pointer items-center gap-2 rounded-md border border-dashed border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40"
          >
            <span className="h-px flex-1 bg-border" />
            Show {DIFF_SAMPLE_HIDDEN.length} unchanged paragraphs
            <span className="h-px flex-1 bg-border" />
          </button>
        )}

        {DIFF_SAMPLE_BLOCKS.slice(2).map(renderBlock)}
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Description Diff Rich",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const RichContent: Story = {
  render: () => (
    <div className="mx-auto max-w-3xl">
      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        Everything the review says sits in the left rail or as an overlay ribbon; the content column
        is the document. Select any text to comment — the comment underlines what it points at, and
        while comments are open Accept is disabled. The collapsed region expands.
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <RichDiff />
      </div>
    </div>
  ),
};
