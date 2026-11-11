/**
 * The selected environment pill under each Nexplore accent theme of the workspace pack served at
 * /pack (T3TEAM_STORYBOOK_PACK_DIR). Light/dark via the toolbar `theme` global.
 * Lila on light cannot carry a tint, so its selected pill is solid with a dark border.
 */
import { resolveEnvironmentFilter } from "@t3tools/client-runtime/t3team-environmentFilter";
import type { EnvironmentAppearance } from "@t3tools/contracts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type CSSProperties } from "react";

import { T3TeamSidebarEnvironmentFilter } from "~/components/sidebar/t3team-SidebarEnvironmentFilter";
import { SidebarProvider } from "~/components/ui/sidebar";
import { applyT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";

const INSET_VARS = {
  "--sidebar-content-inset": "0.5rem",
  "--sidebar-row-content-inset": "0.625rem",
} as unknown as CSSProperties;

const ENVIRONMENTS = [
  { id: "env-local", label: "Dieser Computer", isPrimary: true },
  { id: "env-gm17", label: "NX-GM17GBWE" },
  { id: "env-cloud", label: "Cloud-Sitzung" },
];

async function loadTheme(file: string): Promise<EnvironmentAppearance> {
  const theme = (await (await fetch(`/pack/themes/${file}.json`)).json()) as {
    readonly id: string;
  };
  return { ...theme, themeId: theme.id } as unknown as EnvironmentAppearance;
}

function AccentRow({ file }: { readonly file: string }) {
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>("env-local");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- paints the pack theme onto <html>, held until unmount
  useEffect(() => {
    void loadTheme(file).then((appearance) => {
      applyT3TeamPackAppearance(appearance);
      setReady(true);
    });
    return () => applyT3TeamPackAppearance(undefined);
  }, [file]);
  const filter = resolveEnvironmentFilter({ environments: ENVIRONMENTS, selectedId });
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background p-6" style={{ zoom: 2 }}>
        <div className="w-[300px] rounded-lg bg-sidebar p-1.5" style={INSET_VARS}>
          {ready ? (
            <T3TeamSidebarEnvironmentFilter pills={filter.pills} onSelect={setSelectedId} />
          ) : null}
        </div>
      </div>
    </SidebarProvider>
  );
}

export default {
  title: "T3Team/Sidebar/Environment Filter Accents",
} satisfies Meta;

type Story = StoryObj;

export const Signalblau: Story = { render: () => <AccentRow file="nexplore" /> };
export const Orange: Story = { render: () => <AccentRow file="nexplore-orange" /> };
export const Lila: Story = { render: () => <AccentRow file="nexplore-lila" /> };
