import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import type { EnvironmentSetupProfile } from "@t3tools/contracts";

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
 * `t3team-workProfileChooser.ts`), from Settings, never per project. The cards do not read the
 * flag themselves, so these stories render the real cards directly.
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
