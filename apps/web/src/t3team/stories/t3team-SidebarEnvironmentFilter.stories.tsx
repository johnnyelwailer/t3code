/**
 * Sidebar environment filter: the production pills, fed by the shared `resolveEnvironmentFilter`.
 * Live: click a pill, "All" resets. Light/dark via the toolbar `theme` global.
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
  name: "many environments wrap, same-label cloud sessions told apart",
  render: () => (
    <Frame>
      <Row width={300} environments={MANY} initialSelectedId="env-nas" />
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
