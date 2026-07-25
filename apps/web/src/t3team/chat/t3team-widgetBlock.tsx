/**
 * Inline ad-hoc widget block (Epic 24 ephemeral tier): renders a `widget` message
 * attachment in a sandboxed iframe. `sandbox="allow-scripts"` only — never
 * `allow-same-origin` — so widget code runs in an opaque origin with no access to the app's
 * DOM, storage, or cookies. All host interaction goes through the nonce-validated
 * postMessage bridge owned by the controller hook.
 */

import type { ScopedThreadRef, T3TeamMessageWidgetAttachment } from "@t3tools/contracts";

import { useT3TeamWidgetBlockController } from "~/t3team/chat/t3team-useWidgetBlockController";

export function T3TeamWidgetBlock(props: {
  readonly widget: T3TeamMessageWidgetAttachment["widget"];
  readonly threadRef: ScopedThreadRef | null;
}) {
  const { widget, threadRef } = props;
  const { iframeRef, srcdoc, height } = useT3TeamWidgetBlockController({ widget, threadRef });

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border/55 bg-background/65">
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
