/**
 * Sidebar project scope pills (2026-09-14) — the one-click alternative to the "All projects"
 * dropdown, behind the `t3teamProjectScopePillsEnabled` setting.
 *
 * Design exploration. "V0 current" is the production `T3TeamSidebarProjectScopePills`; V1–V3 are
 * story-only candidates in `t3team-scopePillVariants.tsx` fed the same data and selection
 * contract, so the pick can be ported 1:1. The ⋯ button is the REAL project combobox (search +
 * list) as in `Sidebar.tsx`, minus the per-project settings affordance.
 *
 * Fixtures deliberately mix favicon-less projects (initials fallback), emoji and lucide icons.
 * Every row is live: click a pill, resize by picking a frame width.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderPlusIcon } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { SidebarMenuButton, SidebarProvider } from "~/components/ui/sidebar";
import { T3TeamSidebarProjectScopeCombobox } from "~/components/sidebar/t3team-SidebarProjectScopeCombobox";
import { T3TeamSidebarProjectScopePills } from "~/components/sidebar/t3team-SidebarProjectScopePills";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";

import { ScopeStackChipVariant } from "./t3team-scopePillStackChip";
import {
  ProjectInitials,
  ScopeDotVariant,
  ScopeSegmentedVariant,
  ScopeStackVariant,
  type ScopeVariantProps,
} from "./t3team-scopePillVariants";

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

const VARIANTS: ReadonlyArray<{
  id: string;
  name: string;
  note: string;
  Render: (props: ScopeVariantProps) => ReactNode;
}> = [
  {
    id: "v0",
    name: "V0 · current",
    note: "square SidebarMenuButtons, ring on selection",
    Render: (p) => (
      <T3TeamSidebarProjectScopePills
        groups={p.groups}
        activeScopeKey={p.activeScopeKey}
        onSelectScope={p.onSelectScope}
      />
    ),
  },
  {
    id: "v4",
    name: "V4 · stack + chip (V1 × V2)",
    note: "solid discs in a track; the selection lifts and unfolds its name",
    Render: (p) => <ScopeStackChipVariant {...p} />,
  },
  {
    id: "v1",
    name: "V1 · avatar stack",
    note: "discs overlap when narrow; selected comes forward with a cut-out ring",
    Render: (p) => <ScopeStackVariant {...p} />,
  },
  {
    id: "v2",
    name: "V2 · segmented track",
    note: "raised chip, no border; reveals the name when wide",
    Render: (p) => <ScopeSegmentedVariant {...p} />,
  },
  {
    id: "v3",
    name: "V3 · quiet row + dot",
    note: "bare icons, accent dot marks the selection",
    Render: (p) => <ScopeDotVariant {...p} />,
  },
];

function HeaderRow({
  width,
  initialScope,
  Render,
}: {
  width: number;
  initialScope: string | null;
  Render: (props: ScopeVariantProps) => ReactNode;
}) {
  const [scope, setScope] = useState<string | null>(initialScope);
  return (
    <div className="space-y-1" style={{ width }}>
      <div className="flex items-center gap-1 rounded-lg bg-sidebar p-1.5" style={INSET_VARS}>
        <Render groups={GROUPS} activeScopeKey={scope} onSelectScope={setScope} />
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

function VariantBlock({ variant }: { variant: (typeof VARIANTS)[number] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">{variant.name}</h3>
        <span className="text-xs text-muted-foreground">{variant.note}</span>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        {[220, 260, 300, 360].map((width) => (
          <HeaderRow key={width} width={width} initialScope="portal" Render={variant.Render} />
        ))}
      </div>
    </section>
  );
}

export default {
  title: "T3Team/Sidebar/Project Scope Pills",
  tags: ["autodocs"],
} satisfies Meta;

type Story = StoryObj;

export const AllVariants: Story = {
  name: "all variants × widths 220 / 260 / 300 / 360",
  render: () => (
    <Frame>
      {VARIANTS.map((variant) => (
        <VariantBlock key={variant.id} variant={variant} />
      ))}
    </Frame>
  ),
};

export const StackChip: Story = {
  name: "V4 stack + chip",
  render: () => (
    <Frame>
      <VariantBlock variant={VARIANTS[1]!} />
    </Frame>
  ),
};

export const AvatarStack: Story = {
  name: "V1 avatar stack",
  render: () => (
    <Frame>
      <VariantBlock variant={VARIANTS[2]!} />
    </Frame>
  ),
};

export const SegmentedTrack: Story = {
  name: "V2 segmented track",
  render: () => (
    <Frame>
      <VariantBlock variant={VARIANTS[3]!} />
    </Frame>
  ),
};

export const QuietDot: Story = {
  name: "V3 quiet row + dot",
  render: () => (
    <Frame>
      <VariantBlock variant={VARIANTS[4]!} />
    </Frame>
  ),
};
