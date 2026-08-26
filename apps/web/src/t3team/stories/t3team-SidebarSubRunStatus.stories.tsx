/**
 * GHE #40/#208 — sub-run (child) thread rows, sidebar v2.
 *
 * Child rows share ONE status path with their parent card:
 *   - the SAME ring icon — `ThreadActivityMorphIcon` (sm variant so it fits
 *     the h-7 row; the parent card uses the md variant)
 *   - the SAME live status summary — `resolveActivityPillDisplay` over the
 *     thread's deterministic state word + LLM detail ("Thinking · Reading
 *     contracts"), with the detail gated on `t3teamActivityLabelsEnabled`
 *     exactly like the parent's status slot
 *
 * Production component: `t3team-SidebarSubRunRow.tsx` (rendered below the
 * parent row when its "N sub-runs" chip is expanded). The rows below use
 * the real icon + real label derivation with the production row chrome.
 * All motion respects prefers-reduced-motion (the ring pulse + shimmer are
 * CSS classes from the app stylesheet).
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { CircleCheckIcon } from "lucide-react";

import { ThreadActivityMorphIcon } from "~/components/ThreadActivityStatus";
import { resolveActivityPillDisplay } from "~/t3team/t3team-activityStateDisplay";

/* production inset vars (src/index.css) so the verbatim inset classes work */
const INSET_VARS = {
  "--sidebar-content-inset": "0.5rem",
  "--sidebar-row-content-inset": "0.625rem",
} as unknown as CSSProperties;

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 px-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">▸</span>
      <span className="text-xs font-medium text-zinc-300">{children}</span>
    </div>
  );
}

/**
 * Mirrors the t3team-SidebarSubRunRow status chrome: ring/check on the left,
 * title, then the live summary docked on the right (docked when it fits; in
 * production it flips into the title slot when it does not).
 */
function SubRunStatusRow({
  title,
  activityState,
  activityLabel,
  time,
}: {
  title: string;
  activityState?: "thinking" | "writing" | "working" | "waiting";
  activityLabel?: string;
  time?: string;
}) {
  const settled = activityState === undefined;
  const summary = settled
    ? undefined
    : resolveActivityPillDisplay({
        label: "Working",
        activityState,
        ...(activityLabel ? { activityLabel } : {}),
      });
  return (
    <li role="presentation" className="list-none">
      <div className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md pe-2.5 ps-[calc(var(--sidebar-content-inset)+1rem)] text-left text-xs text-sidebar-muted-foreground/80">
        {settled ? (
          <CircleCheckIcon
            aria-hidden
            className="size-3 shrink-0 text-sidebar-muted-foreground/70"
          />
        ) : (
          <span className="shrink-0 text-sky-600 dark:text-sky-400">
            <ThreadActivityMorphIcon solid={false} size="sm" pulse />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {summary !== undefined ? (
          <span className="shrink-0 text-sky-600 dark:text-sky-400">
            <span className="t3team-label-shimmer">{summary}</span>
          </span>
        ) : null}
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground/55 tabular-nums">
          {time ?? "now"}
        </span>
      </div>
    </li>
  );
}

export default {
  title: "T3Team/Sidebar/Sub-Run Row Status (GHE-40)",
  tags: ["autodocs"],
} satisfies Meta;

type Story = StoryObj;

const DIVIDER = <div className="h-px bg-zinc-200/70 dark:bg-zinc-700/50" />;

export const ChildRowStatus: Story = {
  render: () => (
    <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
      <div style={INSET_VARS} className="flex w-[420px] flex-col gap-4 rounded-lg bg-sidebar p-1.5">
        <div className="space-y-1.5">
          <SectionTitle>
            running sub-runs: the parent's ring (sm) + the parent's live summary (
            <code className="font-mono">state word · detail</code>, shimmers)
          </SectionTitle>
          <SubRunStatusRow
            title="Fix auth regression"
            activityState="thinking"
            activityLabel="Reading contracts"
          />
          <SubRunStatusRow title="Write release notes draft" activityState="writing" time="1m" />
          <SubRunStatusRow title="Run checkout test matrix" activityState="working" time="2m" />
          <SubRunStatusRow title="Sync project template" activityState="waiting" time="5m" />
        </div>
        {DIVIDER}
        <div className="space-y-1.5">
          <SectionTitle>settled sub-run: check mark, no live summary</SectionTitle>
          <SubRunStatusRow title="Sync project template" time="1h" />
        </div>
        <div className="px-1 pb-1 text-[11px] leading-relaxed text-zinc-500">
          Same building blocks as the parent card: <code className="font-mono">size</code>{" "}
          parameterizes one <code className="font-mono">ThreadActivityMorphIcon</code>; the summary
          is <code className="font-mono">resolveActivityPillDisplay</code> — the detail is only
          shown while <code className="font-mono">t3teamActivityLabelsEnabled</code> is on, exactly
          like the parent row.
        </div>
      </div>
    </div>
  ),
};

export const ParentChildSideBySide: Story = {
  name: "Parent card + child row, side by side",
  render: () => (
    <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
      <div style={INSET_VARS} className="flex w-[420px] flex-col gap-4 rounded-lg bg-sidebar p-1.5">
        <div className="space-y-1.5">
          <SectionTitle>parent card row: md ring + live label (same language)</SectionTitle>
          <div className="flex h-7 w-full items-center gap-1.5 rounded-md px-2.5 text-left text-xs text-sidebar-muted-foreground/80">
            <span className="shrink-0 text-sky-600 dark:text-sky-400">
              <ThreadActivityMorphIcon solid={false} pulse />
            </span>
            <span className="min-w-0 flex-1 truncate">Find and triage open issues</span>
            <span className="shrink-0 font-medium text-sky-600 dark:text-sky-400">
              <span className="t3team-label-shimmer">
                {resolveActivityPillDisplay({
                  label: "Working",
                  activityState: "thinking",
                  activityLabel: "Reading contracts",
                })}
              </span>
            </span>
          </div>
          <div className="ml-4">
            <SubRunStatusRow
              title="Fix auth regression"
              activityState="thinking"
              activityLabel="Reading contracts"
            />
          </div>
        </div>
      </div>
    </div>
  ),
};
