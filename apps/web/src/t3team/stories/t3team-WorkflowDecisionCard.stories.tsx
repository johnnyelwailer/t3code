import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamWorkflowDecisionCard } from "~/t3team/chat/t3team-messageDecisionCard";
import { T3TeamShapeCapabilityChips } from "~/t3team/chat/t3team-messageShapeCardCapabilities";

const CONFIRMATION_QUESTION = [
  "Rewrite the description of NXAI-8 with these changes?",
  "",
  'On "the description": Add acceptance criteria and state who the Dev-Rolle is for.',
  'On "the description": Drop the changelog section.',
  "",
  "Confirm, or reply with what to do instead.",
].join("\n");

function decision(overrides?: Record<string, unknown>) {
  return {
    question: CONFIRMATION_QUESTION,
    correlationId: "corr-1",
    affordance: { kind: "text" },
    ...overrides,
  } as never;
}

const meta = {
  title: "T3Team/Workflow Decision Card",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The live regression: authored line breaks used to collapse, fusing the trailing instruction onto
 * the user's own note. The notes are now quoted, so they read as the user's words and not the
 * workflow's.
 */
export const TextAskWithQuotedNotes: Story = {
  render: () => (
    <div className="max-w-xl">
      <T3TeamWorkflowDecisionCard decision={decision()} active onChoose={async () => {}} />
    </div>
  ),
};

/** A schema-backed ask: the choices are the affordance, so the composer pointer stays quiet. */
export const ChoiceAsk: Story = {
  render: () => (
    <div className="max-w-xl">
      <T3TeamWorkflowDecisionCard
        decision={decision({
          affordance: {
            kind: "choice",
            options: ["Looks right — rewrite it", "Let me change something"],
          },
        })}
        active
        onChoose={async () => {}}
      />
    </div>
  ),
};

/** A single-paragraph ask quotes nothing — there is no sandwiched material to set off. */
export const PlainQuestion: Story = {
  render: () => (
    <div className="max-w-xl">
      <T3TeamWorkflowDecisionCard
        decision={decision({ question: "What should change in the description of NXAI-8?" })}
        active
        onChoose={async () => {}}
      />
    </div>
  ),
};

/** History: an answered or superseded card keeps the question readable but offers no controls. */
export const Inactive: Story = {
  render: () => (
    <div className="max-w-xl">
      <T3TeamWorkflowDecisionCard decision={decision()} active={false} />
    </div>
  ),
};

/** Capability disclosure in the same card family — `mutation.draft` reads as a sentence now. */
export const CapabilityChips: Story = {
  render: () => (
    <T3TeamShapeCapabilityChips
      capabilities={
        [
          { kind: "feature", id: "user" },
          { kind: "group", id: "integration.read" },
          { kind: "group", id: "mutation.draft" },
        ] as never
      }
    />
  ),
};
