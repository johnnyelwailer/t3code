import type { T3TeamExplainerBlockOf } from "./model/t3team-explainer";
import { useExplainer } from "./t3team-explainerContext";
import { HostWidgetFrame } from "./t3team-explainerHostKit";
import { EXPLAINER_WIDGET_REGISTRY } from "./t3team-explainerWidgetRegistry";

function Missing({ what }: { what: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-2xs text-muted-foreground">
      {what} is not available here.
    </div>
  );
}

/**
 * An embedded sub-widget: a thread widget artifact the host resolves, drawn in the chat's
 * sandboxed frame, or a registered first-party component.
 */
export function ExplainerWidgetBlock({ block }: { block: T3TeamExplainerBlockOf<"widget"> }) {
  const { resolveWidget, widgetThreadRef } = useExplainer();
  const source = block.source;
  if (source.kind === "artifact") {
    const widget = resolveWidget?.(source.artifactId);
    if (!widget) return <Missing what={block.title ?? "This widget"} />;
    return <HostWidgetFrame widget={widget} threadRef={widgetThreadRef ?? null} />;
  }
  const entry = EXPLAINER_WIDGET_REGISTRY[source.name];
  if (!entry) return <Missing what={block.title ?? "This widget"} />;
  return (
    <div className="min-w-0">
      {block.title ? (
        <div className="mb-1 text-2xs font-medium text-muted-foreground">{block.title}</div>
      ) : null}
      <entry.render props={source.props ?? {}} />
    </div>
  );
}
