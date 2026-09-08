/**
 * GHE-40 activity label — the production component story.
 *
 * The real, shipping component: `ThreadActivityStatus`
 * (src/components/t3team-ThreadActivityStatus.tsx, used by
 * src/components/Sidebar.tsx). These frames mirror the production card row
 * layout exactly (same insets, favicon, title sizer + fit-gate math) so
 * what you see here is what the app renders.
 *
 * Split out of t3team-ActivityLabelVariants.stories.tsx (LOC ceiling); the
 * frames + demos live in t3team-ActivityLabelVariants-prodFrames.tsx.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";

import {
  ProdFitGateDemo,
  ProdKindDemo,
  ProdLiveDemo,
} from "~/t3team/stories/t3team-ActivityLabelVariants-prodFrames";

export default {
  title: "T3Team/Sidebar/Activity Label · Production (GHE-40)",
  tags: ["autodocs"],
} satisfies Meta;

type Story = StoryObj;

const DIVIDER = <div className="h-px bg-zinc-200/70 dark:bg-zinc-700/50" />;

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 px-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">▸</span>
      <span className="text-xs font-medium text-zinc-300">{children}</span>
    </div>
  );
}

export const ProductionComponent: Story = {
  name: "Production component (ships in the app)",
  render: () => (
    <div className="flex min-h-screen items-start justify-center bg-sidebar p-6">
      <div className="flex w-[500px] flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="space-y-1.5">
          <SectionTitle>
            Real <code className="font-mono">ThreadActivityStatus</code> — live label, rolls on
            update every 14s (icon spins, width glides, timer anchored)
          </SectionTitle>
          <ProdLiveDemo />
        </div>
        {DIVIDER}
        <div className="space-y-1.5">
          <SectionTitle>
            working ⇄ done: the icon morphs, the text rolls (toggles every 7s)
          </SectionTitle>
          <ProdKindDemo />
        </div>
        {DIVIDER}
        <div className="space-y-1.5">
          <SectionTitle>
            fit gate: label wider than the space → static truncated, then it slides out to the left
            (right end docks at the right edge), stays, and slides back to the start (loop ≈ 17s)
          </SectionTitle>
          <ProdFitGateDemo />
        </div>
      </div>
    </div>
  ),
};
