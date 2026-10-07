import type { ComponentType } from "react";

import { Badge } from "./t3team-explainerHostKit";

/**
 * First-party components an explainer can embed by name, with JSON props. Each entry checks its
 * own props and draws nothing it cannot use, so a model's bad props never break the step.
 * Register more here (charts, ticket cards, PR chips).
 */
export interface ExplainerWidgetComponent {
  readonly render: ComponentType<{ props: Readonly<Record<string, unknown>> }>;
}

const str = (value: unknown) => (typeof value === "string" ? value : null);

/** A row of before→after measurements, e.g. latency or bundle size. */
function MetricDelta({ props }: { props: Readonly<Record<string, unknown>> }) {
  const metrics = Array.isArray(props.metrics) ? props.metrics : [];
  const rows = metrics.flatMap((metric: unknown) => {
    const entry = (metric ?? {}) as Record<string, unknown>;
    const label = str(entry.label);
    const before = str(entry.before);
    const after = str(entry.after);
    return label && before && after
      ? [{ label, before, after, better: entry.better === true }]
      : [];
  });
  if (rows.length === 0) return null;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-1.5">
      {rows.map((row) => (
        <div
          key={row.label}
          className="rounded-md border border-border/70 bg-background/60 px-2 py-1.5"
        >
          <div className="truncate text-2xs text-muted-foreground">{row.label}</div>
          <div className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-2xs text-muted-foreground line-through">{row.before}</span>
            <span className="text-sm font-semibold text-foreground">{row.after}</span>
            {row.better ? (
              <Badge variant="success" size="sm">
                better
              </Badge>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export const EXPLAINER_WIDGET_REGISTRY: Readonly<Record<string, ExplainerWidgetComponent>> = {
  metricDelta: { render: MetricDelta },
};
