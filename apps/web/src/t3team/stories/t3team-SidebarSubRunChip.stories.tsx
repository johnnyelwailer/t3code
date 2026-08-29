/**
 * Sidebar row refine (2026-08-29) — the sub-runs chip on the sidebar thread row.
 *
 * Two defects in the same indicator:
 *   1. The chip counted ALL children (`counts.total`): after the GHE #304 sweep
 *      a parent with 0 active children still read "189". The chip now counts
 *      ACTIVE sub-runs only (the same running-vs-folded split the "Settled (N)"
 *      fold uses) and renders nothing at 0 active.
 *   2. The chip's active dot used the theme's PRIMARY accent — a red-orange on
 *      the Nexplore theme — so it read as an error dot on idle-looking rows.
 *      It now speaks the working row's 4-state color (sky = in motion), and a
 *      genuinely errored sub-run keeps the red alert mark until its next
 *      activity (current state, not a persisted last-error stamp).
 *
 * Production components in every frame: `InboxSubRunsChip` (seeded through the
 * real `buildChildThreadRelations` → `t3team-sidebarThreadDataStore` chain) and
 * `SidebarSubRunRow` (the compact child rows, incl. the 4-state status marks).
 * The parent-row shell and the "Settled (N)" fold row replicate Sidebar.tsx's
 * exact classes.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, type CSSProperties } from "react";

import { InboxSubRunsChip } from "~/t3team/components/t3team-InboxSlots";
import { SidebarSubRunRow } from "~/components/t3team-SidebarSubRunRow";
import { useT3TeamSidebarThreadDataStore } from "~/t3team/t3team-sidebarThreadDataStore";
import { buildChildThreadRelations } from "~/t3team/hooks/t3team-childThreadRelationsCore";
import type { ProjectThread } from "~/t3team/t3team-types";
import { ChevronRightIcon } from "lucide-react";

const PARENT_ID = "story-parent";

function makeThread(id: string, status: ProjectThread["status"], title?: string): ProjectThread {
  return {
    id,
    projectId: "story-project",
    parentThreadId: PARENT_ID,
    title: title ?? `Sub-run ${id.slice(0, 4)}`,
    messageCount: 1,
    lastMessageAt: "2026-08-29T20:54:00.000Z",
    createdAt: "2026-08-29T18:00:00.000Z",
    status,
  };
}

function seedChildren(children: ReadonlyArray<ProjectThread>): void {
  const parent: ProjectThread = {
    id: PARENT_ID,
    projectId: "story-project",
    title: "Find and triage open issues",
    messageCount: 1,
    lastMessageAt: "2026-08-29T20:54:00.000Z",
    createdAt: "2026-08-29T18:00:00.000Z",
    status: "running",
  };
  const relations = buildChildThreadRelations([parent, ...children]);
  useT3TeamSidebarThreadDataStore
    .getState()
    .setSubRunCountsByParentId(relations.subRunCountsByParentId);
}

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

/** The meta line of the sidebar thread row: branch, chip, provider badge. */
function ParentMetaRow() {
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-secondary-label text-xs">
      <span className="min-w-0 flex-1 truncate whitespace-nowrap">main</span>
      <InboxSubRunsChip threadId={PARENT_ID} />
      <span
        aria-hidden
        className="pointer-events-none ml-auto inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-orange-500/80 text-[8px] font-bold leading-none text-white"
      >
        n
      </span>
    </div>
  );
}

function ParentRow({ title = "Find and triage open issues…" }: { title?: string }) {
  return (
    <div
      className="group/sidebar-row relative w-full rounded-md text-left text-sm"
      style={INSET_VARS}
    >
      <div className="flex min-w-0 items-center gap-2 px-1">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">{title}</span>
        <span className="shrink-0 text-[10px] font-medium text-sky-600 dark:text-sky-300/80">
          Working · 5m
        </span>
      </div>
      <ParentMetaRow />
    </div>
  );
}

function childRefFor(id: string) {
  return { environmentId: "env-local", threadId: id };
}

function SubRunRow({ child }: { child: ProjectThread }) {
  return (
    <SidebarSubRunRow
      child={child}
      childRef={childRefFor(child.id) as never}
      isActive={false}
      onNavigate={() => {}}
      onContextMenu={() => {}}
    />
  );
}

/** Sidebar.tsx's GHE #304 settled fold row, verbatim classes. */
function SettledFoldRow({ count, open = false }: { count: number; open?: boolean }) {
  return (
    <li role="presentation" className="list-none">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {}}
        className="flex h-7 w-full items-center gap-1 rounded-md ps-[calc(var(--sidebar-content-inset)+0.5rem)] text-left text-xs text-muted-foreground/60 hover:bg-sidebar-row-hover hover:text-muted-foreground/90"
      >
        <ChevronRightIcon
          aria-hidden
          className={`size-3 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        />
        <span>Settled ({count})</span>
      </button>
    </li>
  );
}

export default {
  title: "T3Team/Sidebar/Sub-Run Chip (Sidebar Row Refine)",
  tags: ["autodocs"],
} satisfies Meta;

type Story = StoryObj;

export const ActiveThreeSettledFive: Story = {
  name: "(a) 3 active + 5 settled → chip reads '3'",
  render: () => {
    useEffect(() => {
      seedChildren([
        makeThread("c-run-1", "running", "Implement Phase 1"),
        makeThread("c-run-2", "running", "Fix auth regression"),
        makeThread("c-run-3", "running", "Run checkout matrix"),
        ...Array.from({ length: 5 }, (_, i) =>
          makeThread(`c-set-${i}`, "idle", `Settled child ${i + 1}`),
        ),
      ]);
      return () => useT3TeamSidebarThreadDataStore.getState().setSubRunCountsByParentId(new Map());
    }, []);
    return (
      <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
        <div
          style={INSET_VARS}
          className="flex w-[420px] flex-col gap-4 rounded-lg bg-sidebar p-1.5"
        >
          <div className="space-y-1.5">
            <SectionTitle>parent row: chip counts ACTIVE sub-runs only</SectionTitle>
            <ParentRow />
          </div>
          <div className="space-y-1.5">
            <SectionTitle>expanded roster: running rows + the #304 fold</SectionTitle>
            <ul>
              <SubRunRow child={makeThread("c-run-1", "running", "Implement Phase 1")} />
              <SubRunRow child={makeThread("c-run-2", "running", "Fix auth regression")} />
              <SubRunRow child={makeThread("c-run-3", "running", "Run checkout matrix")} />
              <SettledFoldRow count={5} />
            </ul>
          </div>
        </div>
      </div>
    );
  },
};

export const SettledOnlyParent: Story = {
  name: "(b) settled-only parent (189 settled) → no indicator",
  render: () => {
    useEffect(() => {
      seedChildren([
        ...Array.from({ length: 189 }, (_, i) =>
          makeThread(`c-set-${i}`, "idle", `Child ${i + 1}`),
        ),
      ]);
      return () => useT3TeamSidebarThreadDataStore.getState().setSubRunCountsByParentId(new Map());
    }, []);
    return (
      <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
        <div
          style={INSET_VARS}
          className="flex w-[420px] flex-col gap-4 rounded-lg bg-sidebar p-1.5"
        >
          <div className="space-y-1.5">
            <SectionTitle>
              parent row: 0 active → no chip, no empty ring, no "0", no dot
            </SectionTitle>
            <ParentRow />
          </div>
          <div className="space-y-1.5">
            <SectionTitle>the settled work still lives in the #304 fold</SectionTitle>
            <ul>
              <SettledFoldRow count={189} />
            </ul>
          </div>
        </div>
      </div>
    );
  },
};

export const DotStates: Story = {
  name: "(c) idle marks not red; a genuine error stays red",
  render: () => {
    useEffect(() => {
      seedChildren([
        makeThread("c-run-1", "running", "Working child"),
        ...Array.from({ length: 4 }, (_, i) =>
          makeThread(`c-set-${i}`, "idle", `Idle child ${i + 1}`),
        ),
      ]);
      return () => useT3TeamSidebarThreadDataStore.getState().setSubRunCountsByParentId(new Map());
    }, []);
    return (
      <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
        <div
          style={INSET_VARS}
          className="flex w-[420px] flex-col gap-4 rounded-lg bg-sidebar p-1.5"
        >
          <div className="space-y-1.5">
            <SectionTitle>idle parent gets the resting treatment: nothing</SectionTitle>
            <ul>
              <SubRunRow
                child={makeThread("c-idle-1", "idle", "Idle child (faded ring, not red)")}
              />
              <SubRunRow
                child={makeThread("c-done-1", "completed", "Completed child (check mark)")}
              />
            </ul>
          </div>
          <div className="space-y-1.5">
            <SectionTitle>
              current-state error stays red; it clears on the next activity
            </SectionTitle>
            <ul>
              <SubRunRow
                child={makeThread("c-err-1", "error", "Errored child (red alert, current state)")}
              />
              <SubRunRow child={makeThread("c-run-1", "running", "Working child (sky ring)")} />
            </ul>
          </div>
          <div className="px-1 pb-1 text-[11px] leading-relaxed text-zinc-500">
            Before the fix, a thread that hit ANY transient error (a gateway 413, a dropped provider
            session) carried <code className="font-mono">session.lastError</code> forever and
            painted its row red "randomly". The status now follows the session's CURRENT state — red
            only while the session itself is in error, cleared by the next activity.
          </div>
        </div>
      </div>
    );
  },
};
