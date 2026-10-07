import type { Meta, StoryObj } from "@storybook/react";

import { apiExplainer } from "./t3team-explainerApi.fixtures";
import { backendExplainer } from "./t3team-explainerBackend.fixtures";
import { conceptExplainer, layoutExplainer } from "./t3team-explainerConcept.fixtures";
import { hugeExplainer, largeExplainer, trivialExplainer } from "./t3team-explainerMisc.fixtures";
import { ExplainerStoryHarness } from "./t3team-ExplainerStoryHarness";
import { uiExplainer } from "./t3team-explainerUi.fixtures";

/**
 * Explainer player: the story of a subject (a PR, a branch, a concept) as ordered, labelled
 * steps. Each step is a caption and a list of blocks — markdown, diffs, code, a map that morphs
 * with the steps, before/after, video, callouts, tables, embedded widgets. Autoplay tours them.
 *
 * Fixture-driven UI only. Ask anything: hover a caption or block, click a map part or a line
 * number (shift-click for a range), or select text in prose, code or a table.
 * Dark variants set the `theme` global the preview decorator maps onto the app's `.dark` class.
 */
const meta = {
  title: "T3Team/Explainer/Player",
  component: ExplainerStoryHarness,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ExplainerStoryHarness>;

export default meta;

type Story = StoryObj<typeof ExplainerStoryHarness>;

const WIDE = 1100;
const PANEL = 420;
const PHONE = 360;
const dark = { theme: "dark" };

/** #412: the map morphs; the direct GitHub edge is crossed out at step 3. Labelled rail. */
export const BackendPr: Story = { args: { explainer: backendExplainer, width: WIDE } };
export const BackendPrDark: Story = { ...BackendPr, globals: dark };

/** The ~420px PR side panel: blocks stack in reading order. */
export const BackendPrPanel: Story = {
  args: { explainer: backendExplainer, width: PANEL, initialStep: 2 },
};
export const BackendPrPanelDark: Story = {
  args: { explainer: backendExplainer, width: PANEL, initialStep: 4 },
  globals: dark,
};

/** Phone width: labels near the active step, numbers further out. */
export const BackendPrPhone: Story = {
  args: { explainer: backendExplainer, width: PHONE, initialStep: 2 },
};
export const BackendPrPhoneDark: Story = {
  args: { explainer: backendExplainer, width: PHONE, initialStep: 4 },
  globals: dark,
};

/** The tour plays on load; hover or keyboard-focus the step to hold it. */
export const BackendPrAutoplay: Story = {
  args: { explainer: backendExplainer, width: WIDE, autoPlay: true },
};

/** Autoplay at phone width, with a short clock so the advance is easy to see. */
export const BackendPrAutoplayPhone: Story = {
  args: { explainer: backendExplainer, width: PHONE, autoPlay: true, stepMs: 1500 },
};

/** A UI pull request: drag the before/after slider; step 2 is a screen recording. */
export const UiPr: Story = { args: { explainer: uiExplainer, width: WIDE } };
export const UiPrVideo: Story = { args: { explainer: uiExplainer, width: WIDE, initialStep: 1 } };
export const UiPrPanelDark: Story = {
  args: { explainer: uiExplainer, width: PANEL },
  globals: dark,
};

/** An API pull request: a schema diff, then a sequence diagram of the new call order. */
export const ApiPr: Story = { args: { explainer: apiExplainer, width: WIDE } };
export const ApiPrSequence: Story = {
  args: { explainer: apiExplainer, width: WIDE, initialStep: 1 },
};
export const ApiPrPanelDark: Story = {
  args: { explainer: apiExplainer, width: PANEL, initialStep: 1 },
  globals: dark,
};

/** A trivial pull request: two diff-only steps. */
export const TrivialPr: Story = { args: { explainer: trivialExplainer, width: PANEL } };

/** A concept with no code: markdown, a picture, a table and callouts. */
export const Concept: Story = { args: { explainer: conceptExplainer, width: WIDE } };
export const ConceptPanelDark: Story = {
  args: { explainer: conceptExplainer, width: PANEL, initialStep: 1 },
  globals: dark,
};

/**
 * One step using main / aside / full, an embedded thread widget and a registered component,
 * and two detail blocks under "Show more" — one of a type this build does not know.
 */
export const Layout: Story = { args: { explainer: layoutExplainer, width: WIDE } };
export const LayoutPanel: Story = { args: { explainer: layoutExplainer, width: PANEL } };

/** Fourteen steps: labels near the active step, numbers further out. */
export const LargePr: Story = { args: { explainer: largeExplainer, width: WIDE, initialStep: 6 } };
export const LargePrPanel: Story = {
  args: { explainer: largeExplainer, width: PANEL, initialStep: 6 },
};
export const LargePrPhoneDark: Story = {
  args: { explainer: largeExplainer, width: PHONE, initialStep: 4 },
  globals: dark,
};

/** Forty steps in the side panel: the rail fits without overflow. */
export const HugePrPanel: Story = {
  args: { explainer: hugeExplainer, width: PANEL, initialStep: 27 },
};
