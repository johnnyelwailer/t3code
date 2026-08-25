import type { Meta, StoryObj } from "@storybook/react";

/**
 * GHE #40 — placement VARIANTS for the live activity label.
 *
 * Design exploration: four placement options per surface, so the review can
 * pick per surface. Markup mirrors the real components:
 * - Surface 1: the app-level full sidebar row (LegacySidebar thread entry,
 *   text-sm title, `ThreadStatusLabel` pill)
 * - Surface 2: the t3team full sidebar entry (ThreadRow, text-xs title, with
 *   the child-summary second line => multilined entry)
 * - Surface 3: the t3team compact child-thread entry (indented tree row)
 *
 * Placements:
 * A. same line, BEFORE the title (current app behavior)
 * B. same line, AFTER the title (label sits right of the title, left of the time)
 * C. second line (row grows; label on the sub-line where child summaries live)
 * D. dot-only + tooltip (label never rendered as text; tooltip carries it)
 */

const LABEL = "Reading contracts";

type Placement = "before" | "after" | "second-line" | "dot-only";

function Dot({ tooltip }: { tooltip?: string }) {
  return (
    <span
      className="inline-flex size-1.5 shrink-0 animate-pulse rounded-full bg-sky-500 dark:bg-sky-300/80"
      {...(tooltip ? { title: tooltip } : {})}
    />
  );
}

function LabelText() {
  return <span className="truncate text-[10px] text-sky-600 dark:text-sky-300/80">{LABEL}</span>;
}

/** One sidebar row rendered in any of the four placements. */
function Row({
  placement,
  title,
  titleClass,
  secondLine,
  indent = false,
  height = "h-7",
}: {
  placement: Placement;
  title: string;
  titleClass: string;
  secondLine?: string;
  indent?: boolean;
  height?: string;
}) {
  const twoLine = placement === "second-line";
  return (
    <div
      className={`flex w-full items-center gap-1.5 rounded-md bg-accent/40 px-2 ${twoLine ? "py-1.5" : `${height} py-0`} ${indent ? "ml-4" : ""}`}
    >
      {indent ? <span className="text-[9px] text-muted-foreground/50">↳</span> : null}
      {placement === "before" || placement === "dot-only" ? (
        <>
          <Dot {...(placement === "dot-only" ? { tooltip: LABEL } : {})} />
          {placement === "before" ? <LabelText /> : null}
        </>
      ) : null}
      <div className="min-w-0 flex-1 text-left">
        <span className={`block truncate ${titleClass}`}>{title}</span>
        {twoLine ? (
          <span className="flex items-center gap-1">
            <Dot />
            <LabelText />
          </span>
        ) : null}
        {!twoLine && secondLine ? (
          <span className="block truncate text-[10px] text-muted-foreground/75">{secondLine}</span>
        ) : null}
      </div>
      {placement === "after" ? (
        <span className="flex shrink-0 items-center gap-1">
          <Dot />
          <LabelText />
        </span>
      ) : null}
      <span className="shrink-0 text-[10px] text-muted-foreground/40">2m</span>
    </div>
  );
}

const PLACEMENT_NAMES: Record<Placement, string> = {
  before: "A · same line, before the title (current)",
  after: "B · same line, after the title",
  "second-line": "C · second line",
  "dot-only": "D · dot-only + tooltip",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-[420px] rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Labeled({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{name}</span>
      {children}
    </div>
  );
}

export function ActivityLabelVariantsStory() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-sidebar p-8">
      <Section title="Full sidebar thread entry (app-level row, text-sm title)">
        <Labeled name={PLACEMENT_NAMES.before}>
          <Row placement="before" title="Refactor the settings panel" titleClass="text-sm" />
        </Labeled>
        <Labeled name={PLACEMENT_NAMES.after}>
          <Row placement="after" title="Refactor the settings panel" titleClass="text-sm" />
        </Labeled>
        <Labeled name={PLACEMENT_NAMES["second-line"]}>
          <Row placement="second-line" title="Refactor the settings panel" titleClass="text-sm" />
        </Labeled>
        <Labeled name={PLACEMENT_NAMES["dot-only"]}>
          <Row placement="dot-only" title="Refactor the settings panel" titleClass="text-sm" />
        </Labeled>
      </Section>

      <Section title="T3Team full sidebar entry (multilined — child summary on line 2)">
        <Labeled name={PLACEMENT_NAMES["dot-only"]}>
          <Row
            placement="dot-only"
            title="Refactor the settings panel"
            titleClass="text-xs"
            secondLine="2 children · 1 active"
          />
        </Labeled>
        <Labeled name={PLACEMENT_NAMES.before}>
          <Row
            placement="before"
            title="Refactor the settings panel"
            titleClass="text-xs"
            secondLine="2 children · 1 active"
          />
        </Labeled>
        <Labeled name={PLACEMENT_NAMES.after}>
          <Row
            placement="after"
            title="Refactor the settings panel"
            titleClass="text-xs"
            secondLine="2 children · 1 active"
          />
        </Labeled>
        <Labeled
          name={PLACEMENT_NAMES["second-line"] + " — replaces the child summary while active"}
        >
          <Row placement="second-line" title="Refactor the settings panel" titleClass="text-xs" />
        </Labeled>
      </Section>

      <Section title="T3Team compact child-thread entry (indented)">
        <Labeled name={PLACEMENT_NAMES["dot-only"]}>
          <Row placement="dot-only" title="Fix auth bug" titleClass="text-xs" indent height="h-6" />
        </Labeled>
        <Labeled name={PLACEMENT_NAMES.before}>
          <Row placement="before" title="Fix auth bug" titleClass="text-xs" indent height="h-6" />
        </Labeled>
        <Labeled name={PLACEMENT_NAMES.after}>
          <Row placement="after" title="Fix auth bug" titleClass="text-xs" indent height="h-6" />
        </Labeled>
        <Labeled name={PLACEMENT_NAMES["second-line"]}>
          <Row placement="second-line" title="Fix auth bug" titleClass="text-xs" indent />
        </Labeled>
      </Section>
    </div>
  );
}

const meta = {
  title: "T3Team/Sidebar/Activity Label Variants (GHE #40)",
  component: ActivityLabelVariantsStory,
} satisfies Meta<typeof ActivityLabelVariantsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All placement options for all three surfaces, side by side for review. */
export const PlacementVariants: Story = {};

// The label source is `ProjectThread.activityLabel`; the pill resolver already
// exposes it (t3team-projectSidebarStatusPills) — no new data plumbing needed.
