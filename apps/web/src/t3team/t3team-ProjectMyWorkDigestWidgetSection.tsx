import { useMemo } from "react";

import { collectT3TeamWidgetThemeCss } from "~/t3team/chat/t3team-widgetSrcdoc";
import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  buildDigestWidgetSrcdoc,
  digestWidgetSnapshot,
} from "~/t3team/t3team-myworkDigestWidgetSrcdoc";

/**
 * An agent-authored digest section. The iframe matches the thread-widget sandbox: scripts, no
 * same-origin, and a CSP that blocks the network. Theme tokens come from the live document.
 */
export function DigestWidgetSection({
  section,
  graph,
}: {
  readonly section: DigestSection;
  readonly graph: DigestGraph;
}) {
  const srcdoc = useMemo(() => {
    const html = section.widgetHtml ?? "";
    return buildDigestWidgetSrcdoc({
      html,
      snapshot: digestWidgetSnapshot(section, graph),
      themeCss: collectT3TeamWidgetThemeCss(),
    });
  }, [graph, section]);
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-foreground">{section.heading}</h2>
      {section.hint ? <p className="text-xs text-muted-foreground">{section.hint}</p> : null}
      {srcdoc === undefined ? (
        <p className="text-xs text-muted-foreground">This widget was blocked because it reaches the network.</p>
      ) : (
        <iframe
          title={section.heading}
          sandbox="allow-scripts"
          srcDoc={srcdoc}
          className="h-40 w-full rounded-md border border-border bg-transparent"
        />
      )}
    </section>
  );
}
