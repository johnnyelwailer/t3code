import { Bot, Check, ChevronRight, X } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { Button } from "~/t3team/components/ui/t3team-button";
import { WorkItemPersonChip } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
import { WorkItemPriorityChip } from "~/t3team/workitem/t3team-WorkItemPriorityIcon";

/**
 * Design prototypes for reviewing an agent-proposed change.
 *
 * Presentational only — no store, no mutation wiring. The point is to choose a treatment before the
 * real one is built, because this is the surface where an agent's suggestion either reads as
 * trustworthy and reversible, or as something that already happened behind your back.
 *
 * The constraints these have to satisfy, all learned the hard way on this screen:
 * - the meta row's text runs share one baseline, and nothing may add height to it,
 * - a proposal must be visible without hunting, and unmistakably *not yet applied*,
 * - accepting is deliberate; nothing commits from a stray click,
 * - the agent's reason matters — a change with no rationale is harder to accept than to ignore.
 */

function Row({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">{children}</div>
  );
}

function AcceptDismiss({ compact = false }: { readonly compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="icon-xs" variant="ghost" aria-label="Accept proposed change">
        <Check className="size-3.5 text-success" />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Dismiss proposed change">
        <X className="size-3.5 text-muted-foreground" />
      </Button>
      {compact ? null : <span className="sr-only">Accept or dismiss</span>}
    </span>
  );
}

/** A — the proposal sits inline, replacing nothing until accepted. */
function VariantInline() {
  return (
    <Row>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-primary/5 py-0.5 pl-1.5 pr-1">
        <Bot className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <Badge variant="secondary" className="gap-1.5 opacity-60">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/50" />
          To Do
        </Badge>
        <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Badge variant="info" className="gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-info" />
          In Review
        </Badge>
        <AcceptDismiss compact />
      </span>
      <WorkItemPersonChip person={{ displayName: "Philip Jonientz" }} />
      <span className="text-xs tabular-nums text-muted-foreground">8 pts</span>
      <WorkItemPriorityChip priority="2 - major" />
    </Row>
  );
}

/** B — the row stays as it is; a marker signals that something is proposed. */
function VariantMarker() {
  return (
    <div className="flex flex-col gap-3">
      <Row>
        <span className="relative inline-flex">
          <Badge variant="secondary" className="gap-1.5">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/50" />
            To Do
          </Badge>
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-background"
          />
        </span>
        <WorkItemPersonChip person={{ displayName: "Philip Jonientz" }} />
        <span className="text-xs tabular-nums text-muted-foreground">8 pts</span>
        <WorkItemPriorityChip priority="2 - major" />
      </Row>

      <div className="w-fit rounded-lg border border-border/70 bg-card/60 p-2.5 text-xs shadow-sm">
        <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
          <Bot className="size-3.5 text-primary" aria-hidden="true" />
          Proposed by the agent
        </div>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-muted-foreground line-through">To Do</span>
          <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
          <Badge variant="info">In Review</Badge>
        </div>
        <p className="mb-2 max-w-xs leading-5 text-muted-foreground">
          The linked PR was approved and merged this morning.
        </p>
        <div className="flex gap-1.5">
          <Button size="xs">Accept</Button>
          <Button size="xs" variant="ghost">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

/** C — one strip for everything proposed, with per-change accept. */
function VariantBatch() {
  const changes = [
    { field: "Status", from: "To Do", to: "In Review", why: "Linked PR merged this morning." },
    { field: "Assignee", from: "Unassigned", to: "Ada Lovelace", why: "She authored the fix." },
    { field: "Points", from: "—", to: "3", why: "Comparable to KOOR-1483." },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Row>
        <Badge variant="secondary" className="gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-muted-foreground/50" />
          To Do
        </Badge>
        <WorkItemPersonChip person={undefined} />
        <WorkItemPriorityChip priority="2 - major" />
      </Row>

      <div className="overflow-hidden rounded-lg border border-primary/30 bg-primary/5">
        <div className="flex items-center justify-between gap-3 border-b border-primary/20 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Bot className="size-3.5 text-primary" aria-hidden="true" />
            3 changes proposed
          </span>
          <span className="flex gap-1.5">
            <Button size="xs" variant="ghost">
              Dismiss all
            </Button>
            <Button size="xs">Accept all</Button>
          </span>
        </div>

        <div className="divide-y divide-border/50">
          {changes.map((change) => (
            <div key={change.field} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className="w-16 shrink-0 text-muted-foreground">{change.field}</span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="text-muted-foreground line-through">{change.from}</span>
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium text-foreground">{change.to}</span>
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-muted-foreground @xl/draft:block">
                {change.why}
              </span>
              <AcceptDismiss />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Frame({
  label,
  note,
  children,
}: {
  readonly label: string;
  readonly note: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="@container/draft flex flex-col gap-2">
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">{note}</p>
      </div>
      <div className="rounded-xl border border-border bg-background p-4">{children}</div>
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Draft Review",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <Frame
        label="A · Inline, in the row"
        note="The proposal sits where the value lives, old struck through, new beside it. Impossible to miss and obviously not yet applied — but it widens the row, cannot carry a reason, and gets crowded once two fields are proposed at once."
      >
        <VariantInline />
      </Frame>

      <Frame
        label="B · Marker on the field, detail on demand"
        note="The row is untouched apart from a dot, so alignment and density are safe. The card carries the agent's reasoning, which is what makes a proposal acceptable rather than merely visible. Cost: the proposal is one interaction away, so it is easier to overlook."
      >
        <VariantMarker />
      </Frame>

      <Frame
        label="C · One strip for every proposal"
        note="Scales to several changes at once and is the only variant that supports accept-all. Reads as a review queue rather than as edits in place — which is honest for a batch, but further from 'review it where it lands'."
      >
        <VariantBatch />
      </Frame>
    </div>
  ),
};
