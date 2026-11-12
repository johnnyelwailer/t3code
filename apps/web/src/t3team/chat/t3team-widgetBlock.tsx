/**
 * Inline ad-hoc widget block (Epic 24 ephemeral tier): a sandboxed srcdoc iframe carrying the
 * sendPrompt/callTool bridge and CSP `connect-src 'none'`.
 *
 * `t3_show_widget` publishes every widget that does not need the bridge through upstream HTML
 * renders, which the timeline shows from the tool call (HtmlRenderFrame). This block renders the
 * rest: bridge widgets, failed publishes, workflow `thread.showWidget` output, and pack frames.
 */

import type { ScopedThreadRef, T3TeamMessageWidgetAttachment } from "@t3tools/contracts";

import { T3TeamRichChoiceWidgetBlock } from "~/t3team/chat/t3team-RichChoiceWidgetBlock";
import { useT3TeamWidgetBlockController } from "~/t3team/chat/t3team-useWidgetBlockController";

export function T3TeamWidgetBlock(props: {
  readonly widget: T3TeamMessageWidgetAttachment["widget"];
  readonly threadRef: ScopedThreadRef | null;
}) {
  return props.widget.format === "rich-choice" ? (
    <T3TeamRichChoiceWidgetBlock {...props} />
  ) : (
    <T3TeamIframeWidgetBlock {...props} />
  );
}

function T3TeamIframeWidgetBlock(props: {
  readonly widget: T3TeamMessageWidgetAttachment["widget"];
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { widget, threadRef } = props;
  const { iframeRef, srcdoc, height } = useT3TeamWidgetBlockController({ widget, threadRef });

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/55 bg-background/65 p-4">
      <iframe
        ref={iframeRef}
        title={`Widget: ${widget.title}`}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        className="block w-full border-0"
        style={{ height }}
        data-widget-id={widget.widgetId}
        data-widget-format={widget.format}
      />
    </div>
  );
}
