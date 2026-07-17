import type { Meta, StoryObj } from "@storybook/react";

import { T3workWidgetBlock } from "~/t3work/chat/t3work-widgetBlock";

const meta = {
  title: "T3work/WidgetBlock",
  component: T3workWidgetBlock,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof T3workWidgetBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HtmlWidget: Story = {
  args: {
    threadRef: null,
    widget: {
      widgetId: "story-widget-html",
      title: "quarterly_summary",
      format: "html",
      html: `<div style="padding: 12px; border: 1px solid var(--border, #444); border-radius: 8px;">
        <strong style="color: var(--foreground, inherit);">Q4 summary</strong>
        <p style="color: var(--muted-foreground, inherit); margin: 8px 0 0;">Revenue up 14% QoQ.</p>
        <button onclick="sendPrompt('Show the full Q4 breakdown')">Ask for details</button>
      </div>`,
      capabilities: { tools: ["t3work.view.read"] },
      loadingMessages: ["Summing up the quarter"],
    },
  },
};

export const SvgWidget: Story = {
  args: {
    threadRef: null,
    widget: {
      widgetId: "story-widget-svg",
      title: "simple_bars",
      format: "svg",
      html: `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg" width="240">
        <rect x="10" y="30" width="20" height="30" fill="var(--primary, #888)" />
        <rect x="45" y="20" width="20" height="40" fill="var(--primary, #888)" />
        <rect x="80" y="10" width="20" height="50" fill="var(--primary, #888)" />
      </svg>`,
    },
  },
};
