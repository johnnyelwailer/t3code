import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import { T3TeamSetupWelcomeProfileColumn } from "~/t3team/t3team-SetupWelcomeProfileColumn";
import {
  T3TeamProjectSetupProfileCards,
  listT3TeamProjectSetupCardOptions,
} from "~/t3team/t3team-ProjectSetupProfileCards";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";

const packProfiles: readonly EnvironmentSetupProfile[] = [
  {
    id: "requirements-product",
    title: "Requirements Partner",
    description: "Shapes requirements with the team.",
    badge: "REQ",
    bullets: ["Refine scope", "Draft acceptance criteria"],
    category: "product",
    default: true,
  },
  {
    id: "engineer",
    title: "Developer",
    description: "Implementation guidance with diff-first defaults.",
    badge: "DEV",
    bullets: ["Plan changes", "Review diffs"],
    category: "engineering",
  },
];

/**
 * The working-style cards: chosen once (behind `WORK_PROFILE_CHOOSER`, default off — see
 * `t3team-workProfileChooser.ts`), reachable from Settings ("Reopen initial setup") or first run,
 * never per project. `T3TeamProjectSetupProfileCards` itself does not read the flag — the gate
 * lives one level up, in `T3TeamSetupWelcomeSurface` — so these stories render the real cards
 * directly rather than faking server config.
 */
const meta = {
  title: "T3Team/Create Project/Working Style",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Cards({ initial }: { initial: T3TeamProjectSetupProfileId }) {
  const [selected, setSelected] = useState<T3TeamProjectSetupProfileId>(initial);
  return (
    <div className="min-h-screen bg-background p-8">
      <T3TeamProjectSetupProfileCards
        selectedProfileId={selected}
        onSelectProfile={setSelected}
        profiles={packProfiles}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Cards initial={listT3TeamProjectSetupCardOptions(packProfiles)[0]!.id} />,
};

export const DeveloperSelected: Story = {
  render: () => <Cards initial="engineer" />,
};

/** The full first-run / "Reopen initial setup" column, as it renders with the flag on. */
export const WelcomeColumn: Story = {
  render: () => (
    <div className="min-h-screen bg-background p-8">
      <T3TeamSetupWelcomeProfileColumn packProfiles={packProfiles} />
    </div>
  ),
};
