/**
 * Sidebar project scope pills (2026-09-14) — the one-click alternative to the "All projects"
 * dropdown, behind the `t3teamProjectScopePillsEnabled` setting.
 *
 * Production component in every frame: `T3TeamSidebarProjectScopePills`, fed the same
 * `SidebarProjectSnapshot` shape `Sidebar.tsx` derives, in the sidebar's own activity order. The
 * "⋯ more" button and "+ new project" button beside it replicate the header row's real
 * `SidebarMenuButton size="icon"` controls so the composition reads as the shipped header; the
 * combobox that "more" opens lives in `Sidebar.tsx` and is not re-created here.
 *
 * Frames: (a) the default row with a live selection, (b) an active scope that fell out of the top
 * slots and keeps its pill by taking the last one, (c) the row at three sidebar widths.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EllipsisIcon, FolderPlusIcon } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { SidebarMenuButton, SidebarProvider } from "~/components/ui/sidebar";
import { T3TeamSidebarProjectScopePills } from "~/components/sidebar/t3team-SidebarProjectScopePills";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

const INSET_VARS = {
  "--sidebar-content-inset": "0.5rem",
  "--sidebar-row-content-inset": "0.625rem",
} as unknown as CSSProperties;

function group(
  key: string,
  title: string,
  icon: SidebarProjectSnapshot["projectIcon"],
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

/** Sidebar order = most recent activity first. */
const GROUPS: ReadonlyArray<SidebarProjectSnapshot> = [
  group("nexi-work", "nexi-work", { kind: "emoji", emoji: "🧭" }),
  group("t3code", "t3code", { kind: "lucide", name: "code", color: "sky" }),
  group("portal", "Nexi Portal", { kind: "emoji", emoji: "🌐" }),
  group("jira-int", "INT (Jira)", { kind: "lucide", name: "kanban", color: "violet" }),
  group("songflow", "songflow", { kind: "emoji", emoji: "🎵" }),
  group("djangal", "djangal", { kind: "lucide", name: "database", color: "emerald" }),
];

function HeaderRow({
  width,
  initialScope,
  maxPills,
}: {
  width: number;
  initialScope: string | null;
  maxPills?: number;
}) {
  const [scope, setScope] = useState<string | null>(initialScope);
  const active = GROUPS.find((g) => g.projectKey === scope);
  return (
    <div className="space-y-1.5" style={{ width }}>
      <div className="flex items-center gap-1 rounded-lg bg-sidebar p-1.5" style={INSET_VARS}>
        <T3TeamSidebarProjectScopePills
          groups={GROUPS}
          activeScopeKey={scope}
          onSelectScope={setScope}
          maxPills={maxPills}
        />
        <SidebarMenuButton size="icon" aria-label="More projects" className="shrink-0">
          <EllipsisIcon className="size-4" />
        </SidebarMenuButton>
        <SidebarMenuButton size="icon" aria-label="New project" className="shrink-0">
          <FolderPlusIcon className="size-4" />
        </SidebarMenuButton>
      </div>
      <div className="px-1 text-[11px] text-muted-foreground">
        scope →{" "}
        <span className="font-medium text-foreground">{active?.displayName ?? "All projects"}</span>
      </div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  // SidebarMenuButton reads the sidebar context; the provider is the same one the app mounts.
  return (
    <SidebarProvider>
      <div className="flex min-h-screen flex-col items-start gap-6 bg-background p-6">
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

export const Default: Story = {
  name: "(a) recent projects, one click to scope",
  render: () => (
    <Frame>
      <HeaderRow width={280} initialScope={null} />
    </Frame>
  ),
};

export const ActiveOutsideTopSlots: Story = {
  name: "(b) active scope beyond the top 4 keeps a pill",
  render: () => (
    <Frame>
      <HeaderRow width={280} initialScope="djangal" />
    </Frame>
  ),
};

export const Widths: Story = {
  name: "(c) sidebar widths 240 / 280 / 340",
  render: () => (
    <Frame>
      <HeaderRow width={240} initialScope="t3code" maxPills={3} />
      <HeaderRow width={280} initialScope="t3code" />
      <HeaderRow width={340} initialScope="t3code" maxPills={5} />
    </Frame>
  ),
};
