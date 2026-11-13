/**
 * Sidebar environment filter: the production pills, fed by the shared `resolveEnvironmentFilter`.
 * Live: click a pill, "All" resets, +N opens the full list when the row cannot fit them all.
 * Light/dark via the toolbar `theme` global.
 * With only this computer listed the control is hidden, as in the app.
 */
import { resolveEnvironmentFilter } from "@t3tools/client-runtime/t3team-environmentFilter";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type ReactNode } from "react";

import { T3TeamSidebarEnvironmentFilter } from "~/components/sidebar/t3team-SidebarEnvironmentFilter";
import { SidebarProvider } from "~/components/ui/sidebar";

const INSET_VARS = {
  "--sidebar-content-inset": "0.5rem",
  "--sidebar-row-content-inset": "0.625rem",
} as unknown as CSSProperties;

type Env = { id: string; label: string; isPrimary?: boolean };

const THIS_COMPUTER: Env = { id: "env-local", label: "This computer", isPrimary: true };
const CLOUD: Env = { id: "env-cloud-7f3a", label: "Cloud session" };
const SERVER: Env = { id: "env-server", label: "Build server" };
const MANY: ReadonlyArray<Env> = [
  THIS_COMPUTER,
  CLOUD,
  SERVER,
  { id: "env-laptop", label: "Work laptop" },
  { id: "env-nas", label: "NAS" },
  { id: "env-cloud-91bc", label: "Cloud session" },
  { id: "env-staging", label: "Staging VM (eu-west)" },
];

const GERMAN: ReadonlyArray<Env> = [
  { id: "env-local", label: "Dieser Computer", isPrimary: true },
  { id: "env-gm17", label: "NX-GM17GBWE" },
  { id: "env-mn94", label: "NX-MN94KQCLWQ" },
  { id: "env-cloud-2c41", label: "Cloud-Sitzung" },
  { id: "env-cloud-a9e0", label: "Cloud-Sitzung" },
  { id: "env-zrh", label: "Build-Server Zürich (Staging, Nachtbuild mit sehr langem Namen)" },
  { id: "env-vm", label: "Entwicklungs-VM Hamburg" },
];

function Row(props: {
  width: number;
  environments: ReadonlyArray<Env>;
  initialSelectedId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(props.initialSelectedId ?? null);
  const filter = resolveEnvironmentFilter({ environments: props.environments, selectedId });
  return (
    <div className="space-y-1" style={{ width: props.width }}>
      <div className="rounded-lg bg-sidebar p-1.5" style={INSET_VARS}>
        <T3TeamSidebarEnvironmentFilter pills={filter.pills} onSelect={setSelectedId} />
      </div>
      <div className="px-1 text-3xs text-muted-foreground">
        {props.width}px ·{" "}
        {filter.pills === null
          ? "hidden: only one environment"
          : (filter.pills.find((pill) => pill.selected)?.label ?? "All")}
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
  title: "T3Team/Sidebar/Environment Filter",
  tags: ["autodocs"],
} satisfies Meta;

type Story = StoryObj;

export const WithOtherEnvironments: Story = {
  name: "this computer + cloud session + server",
  render: () => (
    <Frame>
      <Row width={300} environments={[THIS_COMPUTER, CLOUD, SERVER]} />
    </Frame>
  ),
};

export const OnlyThisComputer: Story = {
  name: "only this computer → hidden",
  render: () => (
    <Frame>
      <Row width={300} environments={[THIS_COMPUTER]} />
    </Frame>
  ),
};

export const Selected: Story = {
  name: "cloud session selected",
  render: () => (
    <Frame>
      <Row width={300} environments={[THIS_COMPUTER, CLOUD]} initialSelectedId={CLOUD.id} />
    </Frame>
  ),
};

export const ManyEnvironments: Story = {
  name: "many environments fold into +N, same-label cloud sessions told apart",
  render: () => (
    <Frame>
      <Row width={300} environments={MANY} initialSelectedId="env-nas" />
    </Frame>
  ),
};

export const RealisticVariety: Story = {
  name: "German labels, long names, many pills: All and one machine selected",
  render: () => (
    <Frame>
      <div className="flex flex-wrap items-start gap-6">
        <Row width={300} environments={GERMAN} />
        <Row width={300} environments={GERMAN} initialSelectedId="env-mn94" />
        <Row width={220} environments={GERMAN} initialSelectedId="env-zrh" />
      </div>
    </Frame>
  ),
};

export const NarrowWidths: Story = {
  name: "narrow widths 160 / 220 / 300",
  render: () => (
    <Frame>
      <div className="flex flex-wrap items-start gap-6">
        {[160, 220, 300].map((width) => (
          <Row key={width} width={width} environments={[THIS_COMPUTER, CLOUD, SERVER]} />
        ))}
      </div>
    </Frame>
  ),
};
