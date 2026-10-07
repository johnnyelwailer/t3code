import type { Meta, StoryObj } from "@storybook/react";

import { PrExplainerPlayer } from "~/t3team/pr-explainer/t3team-PrExplainerPlayer";

import { backendExplainer, backendThreads } from "./t3team-prExplainerBackend.fixtures";
import { PrExplainerStoryHarness } from "./t3team-PrExplainerStoryHarness";

/**
 * PR Explainer player states: still being written (steps stream in), stale after a new push,
 * failed, and an Ask thread whose answer is still coming in.
 */
const meta = {
  title: "T3Team/PR Explainer/States",
  component: PrExplainerPlayer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PrExplainerPlayer>;

export default meta;

type Story = StoryObj<typeof PrExplainerStoryHarness>;

const render: Story["render"] = (args) => <PrExplainerStoryHarness {...args} />;

/** Steps stream in every few seconds; dashed rail slots hold the ones still being written. */
export const Generating: Story = {
  render,
  args: { explainer: backendExplainer, width: 1100, streamSteps: true },
};

export const GeneratingPanel: Story = {
  render,
  args: { explainer: backendExplainer, width: 420, streamSteps: true, autoPlay: true },
};

/** Nothing written yet: the skeleton under a generating banner. */
export const GeneratingEmpty: Story = {
  render,
  args: {
    explainer: { ...backendExplainer, steps: [] },
    width: 420,
    status: { kind: "generating", expectedSteps: 6 },
  },
};

/** A new push landed after the explainer was written. */
export const Stale: Story = {
  render,
  args: { explainer: backendExplainer, width: 1100, currentHeadSha: "a71be04c22" },
};

export const StalePanelDark: Story = {
  render,
  args: { explainer: backendExplainer, width: 420, currentHeadSha: "a71be04c22" },
  globals: { theme: "dark" },
};

export const Failed: Story = {
  render,
  args: {
    explainer: { ...backendExplainer, steps: [] },
    width: 420,
    status: {
      kind: "error",
      message: "The explainer could not read the diff. The PR has 312 files.",
    },
  },
};

/** The check step with a finished Q&A on the key line and an answer still being written. */
export const AskThreads: Story = {
  render,
  args: { explainer: backendExplainer, width: 1100, threads: backendThreads, initialStep: 4 },
};

export const AskThreadsPanelDark: Story = {
  render,
  args: { explainer: backendExplainer, width: 420, threads: backendThreads, initialStep: 4 },
  globals: { theme: "dark" },
};

export const AskThreadsPhone: Story = {
  render,
  args: { explainer: backendExplainer, width: 360, threads: backendThreads, initialStep: 4 },
};
