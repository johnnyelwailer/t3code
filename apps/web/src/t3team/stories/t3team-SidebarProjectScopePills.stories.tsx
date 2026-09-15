/**
 * Sidebar project scope pills (2026-09-14) — the one-click alternative to the "All projects"
 * dropdown, behind the `t3teamProjectScopePillsEnabled` setting (on by default).
 *
 * Production components only: `T3TeamSidebarProjectScopePills` (the disc stack) and
 * `T3TeamSidebarProjectScopeCombobox` (the real searchable project menu, compact trigger), in
 * the same header-row composition `Sidebar.tsx` renders. Fixtures mix favicon-less projects
 * (initials fallback), emoji and lucide icons. Rows are live: click a disc, pick a width.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderPlusIcon } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { SidebarMenuButton, SidebarProvider } from "~/components/ui/sidebar";
import { T3TeamSidebarProjectScopeCombobox } from "~/components/sidebar/t3team-SidebarProjectScopeCombobox";
import { T3TeamSidebarProjectScopePills } from "~/components/sidebar/t3team-SidebarProjectScopePills";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

const INSET_VARS = {
  "--sidebar-content-inset": "0.5rem",
  "--sidebar-row-content-inset": "0.625rem",
} as unknown as CSSProperties;

function group(
  key: string,
  title: string,
  icon: SidebarProjectSnapshot["projectIcon"] | null,
): SidebarProjectSnapshot {
  return {
    id: key,
    projectKey: key,
    displayName: title,
    title,
    environmentId: "env-local",
    workspaceRoot: `/Users/dev/${key}`,
    faviconPath: null,
    projectIcon: icon,
    groupedProjectCount: 1,
    environmentPresence: "local-only",
    allRemoteMembersAreDesktopLocal: false,
    memberProjects: [],
    memberProjectRefs: [{ environmentId: "env-local", projectId: key }],
    remoteEnvironmentLabels: [],
  } as unknown as SidebarProjectSnapshot;
}

/** Sidebar order = most recent activity first. Two projects have no icon at all → initials. */
const GROUPS: ReadonlyArray<SidebarProjectSnapshot> = [
  group("nexi-work", "nexi-work", null),
  group("t3code", "t3code", { kind: "lucide", name: "code", color: "sky" }),
  group("portal", "Nexi Portal", null),
  group("jira-int", "INT (Jira)", { kind: "lucide", name: "kanban", color: "violet" }),
  group("songflow", "songflow", { kind: "emoji", emoji: "🎵" }),
  group("djangal", "djangal", { kind: "lucide", name: "database", color: "emerald" }),
];

function HeaderRow({ width, initialScope }: { width: number; initialScope: string | null }) {
  const [scope, setScope] = useState<string | null>(initialScope);
  return (
    <div className="space-y-1" style={{ width }}>
      <div className="flex items-center gap-1 rounded-lg bg-sidebar p-1.5" style={INSET_VARS}>
        <T3TeamSidebarProjectScopePills
          groups={GROUPS}
          activeScopeKey={scope}
          onSelectScope={setScope}
        />
        <T3TeamSidebarProjectScopeCombobox
          compact
          projectGroups={GROUPS}
          scopeKey={scope}
          onScopeKeyChange={setScope}
          onOpenProjectSettings={() => {}}
        />
        <SidebarMenuButton size="icon" aria-label="New project" className="shrink-0">
          <FolderPlusIcon className="size-4" />
        </SidebarMenuButton>
      </div>
      <div className="px-1 text-[10px] text-muted-foreground">
        {width}px · {GROUPS.find((g) => g.projectKey === scope)?.displayName ?? "All projects"}
      </div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen flex-col items-start gap-8 bg-background p-6">
        {children}
      </div>
    </SidebarProvider>
  );
}

export default {
  title: "T3Team/Sidebar/Project Scope Pills",
  tags: ["autodocs"],
} satisfies Meta;

type Story = StoryObj;

export const Widths: Story = {
  name: "widths 220 / 260 / 300 / 360, Nexi Portal selected",
  render: () => (
    <Frame>
      <div className="flex flex-wrap items-start gap-6">
        {[220, 260, 300, 360].map((width) => (
          <HeaderRow key={width} width={width} initialScope="portal" />
        ))}
      </div>
    </Frame>
  ),
};

export const AllProjects: Story = {
  name: "nothing selected → All on top",
  render: () => (
    <Frame>
      <HeaderRow width={300} initialScope={null} />
    </Frame>
  ),
};

export const ActiveBeyondCapacity: Story = {
  name: "selected project beyond the visible slots keeps its disc",
  render: () => (
    <Frame>
      <HeaderRow width={240} initialScope="djangal" />
    </Frame>
  ),
};
