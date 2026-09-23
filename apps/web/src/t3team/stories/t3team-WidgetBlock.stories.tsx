import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";

const meta = {
  title: "T3Team/Chat/Widget Block",
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

/**
 * Default card padding: the block's card (border, rounded, translucent bg) owns a `p-4` gutter,
 * so the iframe is inset from the border and the widget body never touches it. This widget's
 * html carries NO padding of its own — its block sits flush against the iframe edge, which only
 * looks right because the card provides the gutter (the srcdoc body padding stays 0).
 */
export const DefaultCardPadding: Story = {
  args: {
    threadRef: null,
    widget: {
      widgetId: "story-widget-default-padding",
      title: "flush_content",
      format: "html",
      html: `<div style="margin:0; padding:0; background:var(--card); color:var(--card-foreground);">
        <strong>Content flush to the iframe edge</strong>
        <p style="margin:8px 0 0; color:var(--muted-foreground);">The 16px gutter around this card is the block's default padding — the widget body itself adds none.</p>
      </div>`,
    },
  },
};
