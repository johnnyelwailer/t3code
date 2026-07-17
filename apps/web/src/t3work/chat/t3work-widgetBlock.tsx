/**
 * Inline ad-hoc widget block (Epic 24 ephemeral tier): renders a `widget` message
 * attachment in a sandboxed iframe. `sandbox="allow-scripts"` only — never
 * `allow-same-origin` — so widget code runs in an opaque origin with no access to the app's
 * DOM, storage, or cookies. All host interaction goes through the nonce-validated
 * postMessage bridge owned by the controller hook.
 */

import type { ScopedThreadRef, T3workMessageWidgetAttachment } from "@t3tools/contracts";

import { useT3workWidgetBlockController } from "~/t3work/chat/t3work-useWidgetBlockController";

export function T3workWidgetBlock(props: {
  readonly widget: T3workMessageWidgetAttachment["widget"];
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { widget, threadRef } = props;
  const { iframeRef, srcdoc, height } = useT3workWidgetBlockController({ widget, threadRef });
  const loadingMessage = widget.loadingMessages?.[0];

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/55 bg-background/65">
      <iframe
        ref={iframeRef}
        title={`Widget: ${widget.title}`}
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        className="block w-full border-0"
        style={{ height, overflow: "auto" }}
        data-widget-id={widget.widgetId}
        data-widget-format={widget.format}
      />
      <div className="flex items-center justify-between border-t border-border/40 px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">{widget.title}</span>
        {loadingMessage ? (
          <span className="text-[11px] text-muted-foreground/70">{loadingMessage}</span>
        ) : null}
      </div>
    </div>
  );
}
