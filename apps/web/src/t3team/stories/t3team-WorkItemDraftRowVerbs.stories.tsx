import { useState } from "react";
import { ArrowRight, Bot, Check, ChevronRight, PenLine, Undo2, X } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react";

import { Button } from "~/t3team/components/ui/t3team-button";
import { Input } from "~/t3team/components/ui/t3team-input";
import { Textarea } from "~/t3team/components/ui/t3team-textarea";
import { cn } from "~/t3team/lib/t3team-utils";

/**
 * What a human can do to a single proposed change.
 *
 * Accept-or-dismiss is too coarse. Most proposals are directionally right and wrong in a detail —
 * the correct assignee is a colleague of the one suggested, the estimate is close but low. Forcing
 * those into "reject" throws away work and teaches the agent nothing, so a row carries three verbs:
 *
 * - **Accept** — commit exactly what was proposed.
 * - **Edit** — commit something else. The proposal was worth keeping as a starting point; the row
 *   turns into the same control a direct edit would use, seeded with the proposed value.
 * - **Send back** — decline with a sentence. Distinct from a silent dismiss: the note travels to the
 *   thread that proposed it (`sourceThreadId`), so the agent can revise rather than guess.
 *
 * Document drafts get no inline accept. A description rewrite cannot be judged from a table row, so
 * the row states its magnitude and hands off to the diff where the change actually lands.
 */

type RowMode = "rest" | "edit" | "return";

type ScalarRow = {
  readonly id: string;
  readonly field: string;
  readonly from: string;
  readonly to: string;
  readonly why: string;
};

const SCALAR_ROWS: ReadonlyArray<ScalarRow> = [
  {
    id: "status",
    field: "Status",
    from: "To Do",
    to: "In Review",
    why: "The linked PR was approved and merged this morning.",
  },
  {
    id: "assignee",
    field: "Assignee",
    from: "Unassigned",
    to: "Ada Lovelace",
    why: "She authored the fix in PR #412.",
  },
  {
    id: "estimate",
    field: "Points",
    from: "—",
    to: "3",
    why: "Comparable in scope to KOOR-1483, which came in at 3.",
  },
];

function Verbs({
  onEdit,
  onReturn,
}: {
  readonly onEdit: () => void;
  readonly onReturn: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <Button size="icon-xs" variant="ghost" aria-label="Accept as proposed">
        <Check className="size-3.5 text-success" />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Edit before accepting" onClick={onEdit}>
        <PenLine className="size-3.5" />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Send back with a note" onClick={onReturn}>
        <Undo2 className="size-3.5" />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Dismiss">
        <X className="size-3.5 text-muted-foreground" />
      </Button>
    </span>
  );
}

function ScalarDraftRow({ row }: { readonly row: ScalarRow }) {
  const [mode, setMode] = useState<RowMode>("rest");
  const [value, setValue] = useState(row.to);
  const rest = () => setMode("rest");

  return (
    <div className={cn("px-3 py-2.5", mode !== "rest" ? "bg-primary/5" : undefined)}>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 shrink-0 text-muted-foreground">{row.field}</span>

        {mode === "edit" ? (
          <>
            {/*
              The proposal seeded the field rather than dictating it — this is the control a direct
              edit would use, so accepting an amended value goes down the one mutation path.
            */}
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="h-7 flex-1 text-xs"
              aria-label={`${row.field}, edit before accepting`}
            />
            <Button size="xs" onClick={rest}>
              Save
            </Button>
            <Button size="xs" variant="ghost" onClick={rest}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate text-muted-foreground line-through">{row.from}</span>
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate font-medium text-foreground">{value}</span>
              {value !== row.to ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">(amended)</span>
              ) : null}
            </span>
            <Verbs onEdit={() => setMode("edit")} onReturn={() => setMode("return")} />
          </>
        )}
      </div>

      {mode === "return" ? (
        <div className="mt-2 pl-[4.5rem]">
          <Textarea
            rows={2}
            placeholder="What is wrong with this? The agent gets your note and can propose again."
            className="text-xs"
            aria-label="Note back to the agent"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button size="xs" variant="ghost" onClick={rest}>
              Cancel
            </Button>
            <Button size="xs" onClick={rest}>
              Send back
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-0.5 pl-[4.5rem] text-[11px] leading-4 text-muted-foreground">{row.why}</p>
      )}
    </div>
  );
}

/** A description or comment draft: magnitude here, judgement where it lands. */
function DocumentDraftRow() {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 text-xs">
      <span className="w-16 shrink-0 text-muted-foreground">Description</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="tabular-nums text-success-foreground">+12</span>
        <span className="tabular-nums text-destructive">−3</span>
        <span className="truncate text-muted-foreground">
          Rewrote the acceptance criteria as a checklist.
        </span>
      </span>
      <Button size="xs" variant="ghost" className="shrink-0">
        Review in place
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}

function DraftStrip() {
  return (
    <div className="overflow-hidden rounded-lg border border-primary/30">
      <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Bot className="size-3.5 text-primary" aria-hidden="true" />4 proposed
        </span>
        <span className="flex gap-1.5">
          <Button size="xs" variant="ghost">
            Dismiss all
          </Button>
          {/*
            Covers the rows that can be judged from here. A description draft is deliberately not
            included — one click must never commit prose nobody has read.
          */}
          <Button size="xs">Accept the 3 field changes</Button>
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {SCALAR_ROWS.map((row) => (
          <ScalarDraftRow key={row.id} row={row} />
        ))}
        <DocumentDraftRow />
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Draft Row Verbs",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const RowVerbs: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-xs leading-5 text-muted-foreground">
        Each field row offers accept, edit-then-accept, send-back-with-a-note, and dismiss. Try the
        pencil on Points and the arrow on Status. The description row has no inline accept — prose
        gets judged against the diff, not summarised into a verdict.
      </p>
      <DraftStrip />
    </div>
  ),
};
