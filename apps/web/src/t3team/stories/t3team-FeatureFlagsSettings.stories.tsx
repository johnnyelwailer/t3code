import type { Meta, StoryObj } from "@storybook/react";
import type { FeatureFlagsView } from "@t3tools/contracts";
import { useState } from "react";

import { FeatureFlagsSettings } from "~/components/settings/t3team-FeatureFlagsSettings";
import { buildFeatureFlagsViewFixture } from "~/components/settings/t3team-featureFlagsSettings.fixture";

const view = buildFeatureFlagsViewFixture();
const withoutUserValues = buildFeatureFlagsViewFixture({ userValues: false });

/** What `server.setFeatureFlag` answers: a user value, or the preset/default layer on reset. */
function applySet(current: FeatureFlagsView, key: string, enabled: boolean | null) {
  return {
    ...current,
    flags: current.flags.map((flag) => {
      if (flag.key !== key) return flag;
      const fallback = withoutUserValues.flags.find((candidate) => candidate.key === key) ?? flag;
      return enabled === null ? fallback : { ...flag, enabled, source: "user" as const };
    }),
  };
}

function FeatureFlagsStory({
  canEdit,
  errors,
}: {
  readonly canEdit: boolean;
  readonly errors: ReadonlyMap<string, string>;
}) {
  const [current, setCurrent] = useState(view);
  return (
    <div className="mx-auto w-full max-w-3xl py-6">
      <FeatureFlagsSettings
        controller={{
          view: current,
          loadError: null,
          canEdit,
          pending: new Map(),
          errors,
          setEnabled: (key, enabled) => setCurrent((state) => applySet(state, key, enabled)),
          reset: (key) => setCurrent((state) => applySet(state, key, null)),
        }}
      />
    </div>
  );
}

const meta = {
  title: "T3Team/Settings/Features",
  component: FeatureFlagsStory,
  args: { canEdit: true, errors: new Map() },
} satisfies Meta<typeof FeatureFlagsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every registered flag: one env override, two user choices, the nightly-dogfood preset. */
export const Default: Story = {};

/** A connection without the settings-write scope sees every switch read-only, with the reason. */
export const ReadOnlyConnection: Story = { args: { canEdit: false } };

export const SaveFailed: Story = {
  args: {
    errors: new Map([["MYWORK_KANBAN", "Could not save MYWORK_KANBAN."]]),
  },
};

export const Narrow: Story = {
  globals: { viewport: { value: "phone", isRotated: false } },
};
