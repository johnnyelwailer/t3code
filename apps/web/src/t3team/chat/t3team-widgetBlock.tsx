/**
 * Inline ad-hoc widget block (Epic 24 ephemeral tier).
 *
 * - `format: "html"` with an `htmlRender` ref (shim onto upstream HtmlRender) → HtmlRenderFrame
 *   when the thread environment is known and the widget has no tool bridge to drive.
 * - Capability widgets (tools allowlist) and legacy html without htmlRender → sandboxed srcdoc
 *   iframe so the sendPrompt/callTool bridge and CSP `connect-src 'none'` stay intact.
 * - svg and other formats stay on the srcdoc widget tier.
 */

import type { ScopedThreadRef, T3TeamMessageWidgetAttachment } from "@t3tools/contracts";
import { readHtmlRenderReference } from "@t3tools/shared/htmlRender";

import { HtmlRenderFrame } from "~/components/chat/HtmlRenderFrame";
import type { ChatFileAttachment } from "~/types";
import { useT3TeamWidgetBlockController } from "~/t3team/chat/t3team-useWidgetBlockController";

function widgetUsesHtmlRenderShim(widget: T3TeamMessageWidgetAttachment["widget"]): boolean {
  if (widget.format !== "html") return false;
  if (readHtmlRenderReference(widget.htmlRender) === undefined) return false;
  // Keep the srcdoc + postMessage bridge when the widget can call tools.
  const tools = widget.capabilities?.tools ?? [];
  return tools.length === 0;
}

export function T3TeamWidgetBlock(props: {
  readonly widget: T3TeamMessageWidgetAttachment["widget"];
  readonly threadRef: ScopedThreadRef | null;
  readonly onOpenHtmlRender?: (attachment: ChatFileAttachment) => void;
}) {
  const { widget, threadRef, onOpenHtmlRender } = props;
  const useShim = widgetUsesHtmlRenderShim(widget) && threadRef !== null;
  const htmlRender = useShim ? readHtmlRenderReference(widget.htmlRender) : undefined;

  if (useShim && htmlRender !== undefined && threadRef !== null) {
    return (
      <div
        className="w-full overflow-hidden rounded-xl border border-border/55 bg-background/65 p-4"
        data-widget-id={widget.widgetId}
        data-widget-format={widget.format}
        data-widget-html-shim="true"
      >
        <HtmlRenderFrame
          environmentId={threadRef.environmentId}
          htmlRender={htmlRender}
          onOpen={onOpenHtmlRender ?? (() => undefined)}
        />
      </div>
    );
  }

  return <T3TeamWidgetSrcdocBlock widget={widget} threadRef={threadRef} />;
}

function T3TeamWidgetSrcdocBlock(props: {
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

/** Exported for tests: whether the block would choose the HtmlRenderFrame shim path. */
export function t3teamWidgetBlockUsesHtmlRenderShim(
  widget: T3TeamMessageWidgetAttachment["widget"],
): boolean {
  return widgetUsesHtmlRenderShim(widget);
}
