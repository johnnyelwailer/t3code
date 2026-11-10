import type { Meta, StoryObj } from "@storybook/react";

import { NexploreAI } from "~/components/t3team-NexploreAIIcon";

import {
  PrimaryAction,
  ServiceMark,
  StatusLabel,
  WelcomeItem,
  WelcomePageShell,
  WelcomeSection,
} from "./t3team-NexiWelcomeLayout.fixtures";
import { NexploreAccountMark } from "./t3team-NexploreAccountMark";

type FinishItem = {
  readonly label: string;
  readonly status: "done" | "skipped" | "ready";
  readonly detail?: string;
};

const ITEMS: readonly FinishItem[] = [
  { label: "Nexplore", status: "done" },
  { label: "Agents", status: "ready", detail: "Nexplore AI" },
  { label: "Role", status: "skipped" },
  { label: "Jira", status: "skipped" },
  { label: "GitHub", status: "skipped" },
  { label: "Cloud", status: "skipped" },
];

function FinishSummary({ items }: { readonly items: readonly FinishItem[] }) {
  return (
    <WelcomePageShell>
      <div className="border-t border-border/50">
        <WelcomeSection title="Finish">
          {items.map((item) => (
            <WelcomeItem
              key={item.label}
              mark={
                <ServiceMark label={item.label}>
                  {item.label === "Nexplore" ? (
                    <NexploreAccountMark />
                  ) : item.label === "Agents" ? (
                    <NexploreAI aria-hidden />
                  ) : (
                    <span className="text-xs font-semibold">{item.label.slice(0, 1)}</span>
                  )}
                </ServiceMark>
              }
              title={item.label}
              description={item.detail}
              status={
                <StatusLabel
                  status={item.status === "skipped" ? "skipped" : "ready"}
                  label={item.status === "skipped" ? "Skipped" : "Done"}
                />
              }
            />
          ))}
        </WelcomeSection>
      </div>
      <div className="mt-6 flex justify-end border-t border-border/50 pt-5">
        <PrimaryAction>Start</PrimaryAction>
      </div>
    </WelcomePageShell>
  );
}

const meta = {
  title: "T3Team/Welcome/Finish",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SummarySkippedOptional: Story = {
  render: () => <FinishSummary items={ITEMS} />,
};

export const SummaryAllDone: Story = {
  render: () => (
    <FinishSummary
      items={ITEMS.map((item) =>
        item.status === "skipped" ? { ...item, status: "done" as const } : item,
      )}
    />
  ),
};
