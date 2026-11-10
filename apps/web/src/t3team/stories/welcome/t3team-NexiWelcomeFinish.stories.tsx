import type { Meta, StoryObj } from "@storybook/react";
import { CheckIcon, CircleDashedIcon } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";

import {
  BrandHeader,
  MoreInSettingsLine,
  WelcomePageShell,
  WelcomeRow,
  WelcomeSection,
} from "./t3team-NexiWelcomeLayout.fixtures";

type FinishItem = {
  readonly label: string;
  readonly status: "done" | "skipped" | "ready";
  readonly detail: string;
};

const ITEMS: readonly FinishItem[] = [
  {
    label: "Nexplore account",
    status: "done",
    detail: "Signed in · reopen from Settings → About",
  },
  {
    label: "Agents",
    status: "ready",
    detail: "Nexplore AI ready",
  },
  {
    label: "Role",
    status: "skipped",
    detail: "Toggle off · enable in Settings → Features",
  },
  {
    label: "Jira",
    status: "skipped",
    detail: "Skipped · Settings → Jira",
  },
  {
    label: "First project",
    status: "skipped",
    detail: "Skipped · create from Home",
  },
  {
    label: "GitHub",
    status: "skipped",
    detail: "Skipped · Settings → GitHub",
  },
  {
    label: "Cloud sessions & phone",
    status: "skipped",
    detail: "Skipped · Settings → Features",
  },
];

function FinishSummary({ items }: { readonly items: readonly FinishItem[] }) {
  return (
    <WelcomePageShell>
      <BrandHeader />
      <div className="border-t border-border/60">
        <WelcomeSection title="Finish">
          <div className="space-y-1">
            <p className="mb-3 text-sm text-muted-foreground">
              You can reopen this setup anytime from{" "}
              <span className="font-medium text-foreground">Settings → About → Welcome page</span>.
            </p>
            {items.map((item) => (
              <WelcomeRow
                key={item.label}
                icon={
                  item.status === "skipped" ? (
                    <CircleDashedIcon className="size-4" />
                  ) : (
                    <CheckIcon className="size-4 text-success-foreground" />
                  )
                }
              >
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </WelcomeRow>
            ))}
          </div>
        </WelcomeSection>
      </div>
      <MoreInSettingsLine />
      <div className="mt-6 flex justify-end">
        <Button>Start</Button>
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

/** Lists what was skipped and where to reopen setup. */
export const SummarySkippedOptional: Story = {
  render: () => <FinishSummary items={ITEMS} />,
};

export const SummaryAllDone: Story = {
  render: () => (
    <FinishSummary
      items={ITEMS.map((item) =>
        item.status === "skipped"
          ? { ...item, status: "done" as const, detail: "Completed during setup" }
          : item,
      )}
    />
  ),
};
