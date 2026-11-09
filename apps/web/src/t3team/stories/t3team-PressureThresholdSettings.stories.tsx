import type { Meta, StoryObj } from "@storybook/react";
import { DEFAULT_RESOURCE_PRESSURE_THRESHOLDS } from "@t3tools/contracts";
import { PressureThresholdForm } from "../../components/settings/t3team-PressureThresholdSettings";

const meta = {
  title: "Settings/Pressure thresholds",
  component: PressureThresholdForm,
  args: { saved: DEFAULT_RESOURCE_PRESSURE_THRESHOLDS, onSave: async () => true },
} satisfies Meta<typeof PressureThresholdForm>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
