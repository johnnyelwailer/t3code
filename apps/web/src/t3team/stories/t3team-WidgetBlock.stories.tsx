import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";

const meta = {
  title: "T3Team/WidgetBlock",
  component: T3TeamWidgetBlock,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof T3TeamWidgetBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HtmlWidget: Story = {
  args: {
    threadRef: null,
    widget: {
      widgetId: "story-widget-html",
      title: "quarterly_summary",
      format: "html",
      html: `<div style="width:100%; padding:12px; border:1px solid var(--border); border-radius:8px; background:var(--card); color:var(--card-foreground);">
        <strong>Q4 summary</strong>
        <p style="color:var(--muted-foreground); margin:8px 0;">Revenue up 14% QoQ.</p>
        <button style="display:inline-flex; align-items:center; gap:6px; color:var(--primary-foreground); background:var(--primary); border:0; border-radius:6px; padding:6px 10px;" onclick="sendPrompt('Show the full Q4 breakdown')">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          Ask for details
        </button>
      </div>`,
      capabilities: { tools: ["t3team.view.read"] },
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
        <rect x="10" y="30" width="20" height="30" fill="var(--primary)" />
        <rect x="45" y="20" width="20" height="40" fill="var(--primary)" />
        <rect x="80" y="10" width="20" height="50" fill="var(--primary)" />
      </svg>`,
    },
  },
};
