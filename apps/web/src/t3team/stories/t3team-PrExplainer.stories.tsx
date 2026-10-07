import type { Meta, StoryObj } from "@storybook/react";

import { PrExplainerPlayer } from "~/t3team/pr-explainer/t3team-PrExplainerPlayer";

import { apiExplainer } from "./t3team-prExplainerApi.fixtures";
import { backendExplainer } from "./t3team-prExplainerBackend.fixtures";
import { largeExplainer, trivialExplainer } from "./t3team-prExplainerMisc.fixtures";
import { PrExplainerStoryHarness } from "./t3team-PrExplainerStoryHarness";
import { uiExplainer } from "./t3team-prExplainerUi.fixtures";

/**
 * PR Explainer player: the story of a pull request as ordered steps (grouped by meaning, not by
 * file), a map that morphs with each step, and an autoplay tour. Each step is a ~10-word
 * caption, the 2–5 changed lines that prove it, and one visual.
 *
 * Fixture-driven UI only — no generation is wired yet. Ask anything: hover a caption, the visual,
 * click a map node or edge, click a line number (shift-click for a range), or select any text.
 * Dark variants set the `theme` global the preview decorator maps onto the app's `.dark` class.
 */
const meta = {
  title: "T3Team/PR Explainer/Player",
  component: PrExplainerPlayer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PrExplainerPlayer>;

export default meta;

type Story = StoryObj<typeof PrExplainerStoryHarness>;

const WIDE = 1100;
const PANEL = 420;
const PHONE = 360;

const render: Story["render"] = (args) => <PrExplainerStoryHarness {...args} />;

/** #412: cache digest PR reads. The map morphs: the direct GitHub edge is crossed out at step 3. */
export const BackendPr: Story = { render, args: { explainer: backendExplainer, width: WIDE } };

export const BackendPrDark: Story = {
  render,
  args: { explainer: backendExplainer, width: WIDE },
  globals: { theme: "dark" },
};

/** The ~420px PR side panel: visual stacks above the diff. */
export const BackendPrPanel: Story = {
  render,
  args: { explainer: backendExplainer, width: PANEL, initialStep: 2 },
};

export const BackendPrPanelDark: Story = {
  render,
  args: { explainer: backendExplainer, width: PANEL, initialStep: 4 },
  globals: { theme: "dark" },
};

/** Phone width: the rail collapses to dots. */
export const BackendPrPhone: Story = {
  render,
  args: { explainer: backendExplainer, width: PHONE, initialStep: 2 },
};

export const BackendPrPhoneDark: Story = {
  render,
  args: { explainer: backendExplainer, width: PHONE, initialStep: 4 },
  globals: { theme: "dark" },
};

/** The tour plays on load; hover the step to hold it. */
export const BackendPrAutoplay: Story = {
  render,
  args: { explainer: backendExplainer, width: WIDE, autoPlay: true },
};

/** A UI pull request: drag the before/after slider; step 2 pairs them. */
export const UiPr: Story = { render, args: { explainer: uiExplainer, width: WIDE } };

export const UiPrPanelDark: Story = {
  render,
  args: { explainer: uiExplainer, width: PANEL },
  globals: { theme: "dark" },
};

/** An API pull request: a schema diff, then a sequence diagram of the new call order. */
export const ApiPr: Story = { render, args: { explainer: apiExplainer, width: WIDE } };

export const ApiPrSequence: Story = {
  render,
  args: { explainer: apiExplainer, width: WIDE, initialStep: 1 },
};

export const ApiPrPanelDark: Story = {
  render,
  args: { explainer: apiExplainer, width: PANEL, initialStep: 1 },
  globals: { theme: "dark" },
};

/** A trivial pull request: two diff-only steps, no visual. */
export const TrivialPr: Story = { render, args: { explainer: trivialExplainer, width: PANEL } };

/** Fourteen steps: the rail at its fullest, wide and as dots. */
export const LargePr: Story = { render, args: { explainer: largeExplainer, width: WIDE } };

export const LargePrPhone: Story = {
  render,
  args: { explainer: largeExplainer, width: PHONE, initialStep: 4 },
};
