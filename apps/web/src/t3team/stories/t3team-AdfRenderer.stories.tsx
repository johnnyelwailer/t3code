import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, type ReactNode } from "react";

import { T3TeamAdfRenderer } from "~/t3team/workitem/adf/t3team-AdfRenderer";
import { T3TEAM_ADF_KITCHEN_SINK_DOC } from "~/t3team/workitem/adf/t3team-adfKitchenSink.fixtures";

/**
 * Media in real Jira documents resolves through `createJiraTicketAssetUrlResolver`. Storybook
 * has no Jira session, so the story maps the fixture's filename to an inline SVG data URL —
 * the same one-argument contract the app passes in.
 */
const STORY_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
       <rect width="320" height="180" fill="gray" opacity="0.08" />
       <rect x="24" y="120" width="48" height="36" fill="gray" opacity="0.55" />
       <rect x="88" y="84" width="48" height="72" fill="gray" opacity="0.55" />
       <rect x="152" y="48" width="48" height="108" fill="gray" opacity="0.55" />
     </svg>`,
  );

function resolveStoryAssetUrl(url: string): string {
  return url === "diagram.png" ? STORY_IMAGE : url;
}

function T3TeamAdfStoryFrame({
  dark,
  children,
}: {
  readonly dark: boolean;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);

  return (
    <div className="bg-background p-6 text-foreground">
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}

const meta: Meta<typeof T3TeamAdfRenderer> = {
  title: "T3Team/WorkItem/AdfRenderer",
  component: T3TeamAdfRenderer,
  parameters: { layout: "padded" },
  decorators: [
    // `parameters.t3teamTheme: "dark"` flips the app's theme so the same document can be
    // reviewed in both: the token overrides are scoped to `:root.dark`, so the class has to
    // live on the document element (same approach as t3team-PackBranding.stories.tsx).
    (Story, context) => (
      <T3TeamAdfStoryFrame dark={context.parameters["t3teamTheme"] === "dark"}>
        <Story />
      </T3TeamAdfStoryFrame>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Every node family in one document: the visual review surface for the ADF renderer. */
export const KitchenSink: Story = {
  args: {
    doc: T3TEAM_ADF_KITCHEN_SINK_DOC,
    resolveAssetUrl: resolveStoryAssetUrl,
  },
};

/** The same document in the dark theme: no hardcoded colours, so only the tokens change. */
export const KitchenSinkDark: Story = {
  args: {
    doc: T3TEAM_ADF_KITCHEN_SINK_DOC,
    resolveAssetUrl: resolveStoryAssetUrl,
  },
  parameters: { t3teamTheme: "dark" },
};

/** Jira issue targets route through the host instead of opening a browser tab. */
export const InAppIssueNavigation: Story = {
  args: {
    doc: T3TEAM_ADF_KITCHEN_SINK_DOC,
    resolveAssetUrl: resolveStoryAssetUrl,
    onOpenIssue: (issueKey: string) => console.log(`open issue ${issueKey}`),
  },
};

/** A narrow pane: the table keeps its own horizontal scroll, the page never scrolls sideways. */
export const NarrowPane: Story = {
  args: {
    doc: T3TEAM_ADF_KITCHEN_SINK_DOC,
    resolveAssetUrl: resolveStoryAssetUrl,
  },
  decorators: [
    (Story) => (
      <div className="w-[340px] overflow-hidden rounded-lg border border-border/70 p-3">
        <Story />
      </div>
    ),
  ],
};

/** Nothing renders for an empty document — no placeholder, no invented copy. */
export const EmptyDocument: Story = {
  args: { doc: { version: 1, type: "doc", content: [] } },
};
