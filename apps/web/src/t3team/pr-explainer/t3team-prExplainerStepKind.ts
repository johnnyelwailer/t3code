import type { T3TeamPrExplainerStepKind } from "@t3tools/contracts";
import { FlaskConicalIcon, HistoryIcon, PencilLineIcon, TriangleAlertIcon } from "lucide-react";

/** One tone per step kind, shared by the rail, the caption and the header's "to check" count. */
export const PR_EXPLAINER_STEP_KIND = {
  context: {
    label: "Before",
    Icon: HistoryIcon,
    text: "text-muted-foreground",
    segment: "bg-muted-foreground/35",
    segmentDone: "bg-muted-foreground/60",
  },
  change: {
    label: "Change",
    Icon: PencilLineIcon,
    text: "text-primary",
    segment: "bg-primary/25",
    segmentDone: "bg-primary/70",
  },
  check: {
    label: "Check",
    Icon: TriangleAlertIcon,
    text: "text-warning-foreground",
    segment: "bg-warning/35",
    segmentDone: "bg-warning",
  },
  tests: {
    label: "Tests",
    Icon: FlaskConicalIcon,
    text: "text-success-foreground",
    segment: "bg-success/30",
    segmentDone: "bg-success/80",
  },
} as const satisfies Record<T3TeamPrExplainerStepKind, unknown>;
