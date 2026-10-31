import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { T3TeamRichChoice } from "~/t3team/rich-choice/t3team-RichChoice";
import type { RichChoiceOption } from "~/t3team/rich-choice/t3team-richChoice.logic";

/** A tiny flat illustration per role, as a data URL, so the story needs no assets. */
const art = (hue: number, glyph: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="hsl(${hue} 70% 88%)"/><circle cx="60" cy="48" r="20" fill="hsl(${hue} 60% 55%)"/><rect x="26" y="74" width="68" height="34" rx="17" fill="hsl(${hue} 60% 45%)"/><text x="60" y="56" font-size="22" text-anchor="middle" fill="white" font-family="sans-serif">${glyph}</text></svg>`,
  )}`;

const roles: readonly RichChoiceOption[] = [
  {
    id: "requirements-product",
    title: "Requirements & Product",
    tag: "RE / PO",
    image: { src: art(200, "RE") },
    body: "Backlog quality end to end: readiness gates, real acceptance criteria instead of template text, and stakeholder-ready framing of what a story is for.\n\nNexi leads with questions and summaries, and keeps technical detail short.",
    chips: ["Lens: backlog health", "Recipes: refine, gate, recap", "Style: short, guided"],
  },
  {
    id: "delivery-lead",
    title: "Delivery Lead",
    tag: "DL",
    image: { src: art(30, "DL") },
    body: "Flow, risks and commitments: stale reviews, estimate overruns and unanswered clarification threads surface before they cost a sprint.",
    chips: ["Lens: flow and risk", "Recipes: status, nudge, plan", "Style: concise"],
  },
  {
    id: "engineer",
    title: "Engineer",
    tag: "DEV",
    image: { src: art(140, "DEV") },
    body: "Implementation first: plans, diffs and tests, with the work item context one step away.",
    chips: ["Lens: code and diffs", "Recipes: implement, review", "Style: technical"],
  },
  {
    id: "quality-testing",
    title: "Quality & Testing",
    tag: "QA",
    image: { src: art(280, "QA") },
    body: "Test design and verification: acceptance checks derived from the story, regression focus and evidence you can attach.",
    chips: ["Lens: verification", "Recipes: test plan, evidence", "Style: precise"],
  },
  {
    id: "security",
    title: "Security",
    tag: "SEC",
    image: { src: art(350, "SEC") },
    body: "Risk-led review: dependency and permission changes, secrets handling and threat notes on the work that matters.",
    chips: ["Lens: risk", "Recipes: review, threat note", "Style: formal"],
  },
];

/**
 * The generic rich-choice carousel: one card in full, neighbours peeking. Swipe/drag, arrows, ←/→
 * keys, dots, or click a peeking card to bring it forward; only "Choose this" chooses. Switch the
 * theme with the toolbar and the viewport with the Viewport addon (phone / tablet / desktop).
 */
const meta = {
  title: "T3Team/Rich Choice",
  component: T3TeamRichChoice,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof T3TeamRichChoice>;
export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Who are you, and how do you want to work?
        </h2>
        {children}
      </div>
    </div>
  );
}

function Roles({ selected, defaultId }: { selected?: string; defaultId?: string }) {
  const [last, setLast] = useState<string | null>(selected ?? null);
  return (
    <Frame>
      <T3TeamRichChoice
        prompt="Choose your role"
        options={roles}
        defaultId={defaultId}
        selectedIds={last ? [last] : []}
        onChoose={([id]) => setLast(id ?? null)}
      />
      <p className="text-center text-sm text-muted-foreground" data-testid="picked">
        {last ? `Chosen: ${last}` : "Nothing chosen yet"}
      </p>
    </Frame>
  );
}

export const RoleChoice: Story = {
  args: { prompt: "Choose your role", options: roles, onChoose: () => {} },
  render: () => <Roles />,
};

/** Opens on the second role, with the current setting marked (the Settings picker case). */
export const CurrentSettingMarked: Story = {
  args: { prompt: "Choose your role", options: roles, onChoose: () => {} },
  render: () => <Roles defaultId="delivery-lead" selected="delivery-lead" />,
};

/** Agent-offered multi-select: cards toggle in and out, "Confirm" returns every pick. */
export const MultiSelect: Story = {
  args: { prompt: "Which features do you want?", options: roles, onChoose: () => {} },
  render: () => (
    <Frame>
      <T3TeamRichChoice
        prompt="Which features do you want?"
        options={roles.slice(0, 4)}
        multiple
        selectedIds={["engineer"]}
        onChoose={() => {}}
      />
    </Frame>
  ),
};

/** Two options: the neighbour still peeks, and the arrows disable at the ends. */
export const TwoOptions: Story = {
  args: { prompt: "Pick a model preset", options: roles, onChoose: () => {} },
  render: () => (
    <Frame>
      <T3TeamRichChoice
        prompt="Pick a model preset"
        options={roles.slice(0, 2)}
        onChoose={() => {}}
      />
    </Frame>
  ),
};
