import { useEffect, useRef, useState } from "react";
import { Film, Image as ImageIcon, MessageSquarePlus } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Textarea } from "~/t3team/components/ui/t3team-textarea";
import { cn } from "~/t3team/lib/t3team-utils";
import {
  T3TeamDiffBlock,
  T3TeamDiffTag,
  T3TeamDiffText,
} from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";

/**
 * The same review, on content that is not prose.
 *
 * Every node type gets diffed at the granularity it actually has:
 *
 * - **Media** — no granularity at all. An image is the same image or a different one; there is no
 *   half-struck-through picture. Removed media dims and gets a tag, added media gets a tag.
 * - **Tables** — by cell. One changed figure must not redline the whole table, so only that cell
 *   carries word-level marks and only the new row carries a gutter.
 * - **Code** — by line, monospace, with a `+`/`-` gutter. This is the one place a patch view is
 *   correct, which is also why using it for the whole document is wrong.
 * - **Containers** (panels, quotes, expands) — recurse. The panel survived; its sentence changed.
 * - **Inline atoms** (mentions, status lozenges, dates) — one token each. `@Ada → @Bob` is a
 *   deletion and an insertion of two chips, not an eleven-character text edit.
 * - **Opaque nodes** we cannot introspect — compare the serialized JSON and say only "changed".
 *   Claiming more detail than we have would be a lie in a place where trust is the whole point.
 *
 * Unchanged regions collapse: a 40-paragraph spec with one edited table is otherwise a scroll hunt.
 */

/** Stand-in for a real media node — the point here is the framing, not the picture. */
function MediaThumb({
  label,
  kind,
  muted,
}: {
  readonly label: string;
  readonly kind: "image" | "video";
  readonly muted?: boolean;
}) {
  const Icon = kind === "image" ? ImageIcon : Film;
  return (
    <figure className={cn("w-52 shrink-0", muted && "opacity-55 grayscale")}>
      <div className="flex h-28 items-center justify-center rounded-md border border-border bg-muted/40">
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function CollapsedRegion({ count }: { readonly count: number }) {
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40"
    >
      <span className="h-px flex-1 bg-border" />
      {count} unchanged paragraphs
      <span className="h-px flex-1 bg-border" />
    </button>
  );
}

const CODE_LINES: ReadonlyArray<{ readonly text: string; readonly kind?: "add" | "del" }> = [
  { text: "const rows = await parseCatalogue(file);" },
  { text: "if (rows.length > MAX_ROWS) throw new TooLarge();", kind: "del" },
  { text: "if (rows.length > MAX_ROWS) return chunk(rows, MAX_ROWS);", kind: "add" },
  { text: "return stage(rows);" },
];

function CodeBlockDiff() {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 py-1.5 text-xs leading-5">
      {CODE_LINES.map((line) => (
        <div
          key={`${line.kind ?? "same"}:${line.text}`}
          className={cn(
            "flex gap-1.5 px-2",
            line.kind === "add" && "bg-success/10",
            line.kind === "del" && "bg-destructive/10",
          )}
        >
          <span
            className={cn(
              "w-3 shrink-0 select-none text-right font-mono",
              line.kind === "add" && "text-success-foreground",
              line.kind === "del" && "text-destructive",
              !line.kind && "text-muted-foreground/50",
            )}
          >
            {line.kind === "add" ? "+" : line.kind === "del" ? "−" : ""}
          </span>
          <code className="whitespace-pre font-mono text-foreground">{line.text}</code>
        </div>
      ))}
    </pre>
  );
}

function TableDiff() {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Stage</th>
            <th className="px-2.5 py-1.5 font-medium">Budget</th>
            <th className="px-2.5 py-1.5 font-medium">Owner</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          <tr>
            <td className="px-2.5 py-1.5">Parse</td>
            <td className="px-2.5 py-1.5">
              {/* Only the cell that moved carries marks. */}
              <T3TeamDiffText
                segments={[
                  { text: "400", kind: "del" },
                  { text: "150", kind: "add" },
                  { text: " ms" },
                ]}
              />
            </td>
            <td className="px-2.5 py-1.5">Platform</td>
          </tr>
          <tr>
            <td className="px-2.5 py-1.5">Stage write</td>
            <td className="px-2.5 py-1.5">900 ms</td>
            <td className="px-2.5 py-1.5">Platform</td>
          </tr>
          <tr className="bg-success/5">
            <td className="px-2.5 py-1.5">
              <span className="-ml-1.5 mr-1 select-none text-success-foreground">+</span>
              Dedupe
            </td>
            <td className="px-2.5 py-1.5">120 ms</td>
            <td className="px-2.5 py-1.5">Data</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MentionChip({ name, kind }: { readonly name: string; readonly kind?: "add" | "del" }) {
  return (
    <span
      className={cn(
        "mx-px inline-flex items-center rounded-[3px] px-1 text-[0.8125rem]",
        kind === "del" && "bg-destructive/10 text-muted-foreground line-through",
        kind === "add" && "bg-success/15 text-foreground",
        !kind && "bg-accent text-foreground",
      )}
    >
      @{name}
    </span>
  );
}

/**
 * The gutter affordance that turns any block into a place to leave targeted feedback.
 *
 * It lives in a reserved gutter rather than floating over the text — an affordance that appears on
 * hover *on top of* the first word makes the content harder to read at the moment you lean in.
 */
function CommentAffordance() {
  return (
    <span className="pointer-events-none absolute -left-8 top-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
      <button
        type="button"
        aria-label="Comment on this block"
        className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-border bg-popover text-muted-foreground shadow-sm hover:text-foreground"
      >
        <MessageSquarePlus className="size-3.5" />
      </button>
    </span>
  );
}

/**
 * Comment on an arbitrary selection.
 *
 * Block-level feedback is not fine-grained enough — "this clause is wrong" needs to point at the
 * clause. The anchor is the selected range; on a revision it either still matches or the comment is
 * marked stale, which is honest and is what a reviewer expects from quoted text.
 */
const COMPOSER_WIDTH_PX = 288;

function SelectionCommentLayer({
  containerRef,
}: {
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [anchor, setAnchor] = useState<
    { readonly top: number; readonly left: number; readonly quote: string } | undefined
  >(undefined);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const onMouseUp = () => {
      const selection = window.getSelection();
      const container = containerRef.current;
      if (!container) return;
      if (!selection || selection.isCollapsed || selection.toString().trim() === "") {
        /* Keep an open composer alive — clicking into the textarea collapses the selection. */
        setAnchor((current) => (composing ? current : undefined));
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return;

      const rect = range.getBoundingClientRect();
      const base = container.getBoundingClientRect();
      /* Clamp, or a selection near the right margin opens a composer half outside the panel. */
      const left = Math.max(0, Math.min(rect.left - base.left, base.width - COMPOSER_WIDTH_PX));
      setAnchor({
        top: rect.bottom - base.top + 6,
        left,
        quote: selection.toString().trim(),
      });
      setComposing(false);
    };

    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [containerRef, composing]);

  if (!anchor) return null;

  return (
    <div
      className="absolute z-20 w-72 max-w-[calc(100%-1rem)]"
      style={{ top: anchor.top, left: anchor.left }}
    >
      {composing ? (
        <div className="rounded-lg border border-border bg-popover p-2 shadow-lg">
          <p className="mb-1.5 line-clamp-2 border-l-2 border-primary/50 pl-2 text-[11px] italic text-muted-foreground">
            {anchor.quote}
          </p>
          <Textarea
            autoFocus
            rows={2}
            placeholder="What should change here?"
            className="text-xs"
            aria-label="Comment on the selected text"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button size="xs" variant="ghost" onClick={() => setAnchor(undefined)}>
              Cancel
            </Button>
            <Button size="xs" onClick={() => setAnchor(undefined)}>
              Send
            </Button>
          </div>
        </div>
      ) : (
        <Button size="xs" onClick={() => setComposing(true)}>
          <MessageSquarePlus className="size-3.5" />
          Comment on selection
        </Button>
      )}
    </div>
  );
}

function Block({
  kind,
  children,
}: {
  readonly kind?: "add" | "del" | "edit";
  readonly children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <CommentAffordance />
      <T3TeamDiffBlock {...(kind ? { kind } : {})}>{children}</T3TeamDiffBlock>
    </div>
  );
}

function RichDiff() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative space-y-3 py-2 pl-14 pr-3 text-sm leading-6 text-foreground"
    >
      <SelectionCommentLayer containerRef={containerRef} />
      <Block kind="edit">
        <p>
          Owner for the rollout is <MentionChip name="Ada Lovelace" kind="del" />
          <MentionChip name="Bo Meyer" kind="add" />, with sign-off from{" "}
          <MentionChip name="Platform" />.
        </p>
      </Block>

      <CollapsedRegion count={14} />

      <Block kind="edit">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rollout state</span>
          <Badge variant="secondary" className="line-through opacity-70">
            BLOCKED
          </Badge>
          <Badge variant="success">READY</Badge>
        </div>
      </Block>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Screenshots</p>
        <div className="flex flex-wrap items-start gap-3">
          <div className="space-y-1">
            <MediaThumb label="importer-old.png" kind="image" muted />
            <T3TeamDiffTag kind="del">Removed</T3TeamDiffTag>
          </div>
          <div className="space-y-1">
            <MediaThumb label="importer-progress.png" kind="image" />
            <T3TeamDiffTag kind="add">Added</T3TeamDiffTag>
          </div>
          <div className="space-y-1">
            <MediaThumb label="walkthrough.mp4" kind="video" />
            <T3TeamDiffTag kind="edit">Caption changed</T3TeamDiffTag>
          </div>
        </div>
      </div>

      <Block>
        <p className="text-xs font-medium text-muted-foreground">Performance budget</p>
      </Block>
      <Block>
        <TableDiff />
      </Block>

      <Block>
        <CodeBlockDiff />
      </Block>

      {/* A container that survived a change to its contents. */}
      <Block kind="edit">
        <div className="rounded-md border-l-2 border-info bg-info/8 px-3 py-2">
          <p className="text-[0.8125rem] leading-6">
            <T3TeamDiffText
              segments={[
                { text: "Do not run this against production before " },
                { text: "the platform team has signed off", kind: "del" },
                { text: "the dedupe stage has a rollback", kind: "add" },
                { text: "." },
              ]}
            />
          </p>
        </div>
      </Block>

      <Block kind="edit">
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Roadmap planner embed
          <T3TeamDiffTag kind="edit">Changed</T3TeamDiffTag>
          <span className="text-[11px]">contents not comparable</span>
        </div>
      </Block>
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
        Media, tables, code, panels, mentions, lozenges and an opaque embed — each diffed at its own
        granularity. Hover any block to reveal the comment affordance in the left gutter.
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <RichDiff />
      </div>
    </div>
  ),
};
