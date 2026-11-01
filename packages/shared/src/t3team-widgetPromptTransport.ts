/**
 * The hidden, agent-visible message an explicit user action inside a widget sends back (a bridge
 * widget's `sendPrompt`, a rich-choice pick). One builder for every client, so web and mobile send
 * the identical message and the thread derives the same answered/superseded card state from it.
 */
import type { T3TeamMessageExt } from "@t3tools/contracts";

export function humanizeWidgetTitle(title: string): string {
  return title.replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ").trim();
}

/** Build the hidden, agent-visible envelope for an explicit user action inside a widget. */
export function buildT3TeamWidgetPromptTransport(input: {
  readonly widgetId: string;
  readonly widgetTitle: string;
  readonly text: string;
}): { readonly text: string; readonly t3teamExt: T3TeamMessageExt } {
  const widgetTitle = humanizeWidgetTitle(input.widgetTitle) || "Widget";
  return {
    text: `Widget “${widgetTitle}” action: ${input.text.trim()}`,
    t3teamExt: {
      displayText: input.text.trim(),
      visibleToUser: false,
      visibleToAgent: true,
      widgetReply: { widgetId: input.widgetId, widgetTitle },
    },
  };
}
