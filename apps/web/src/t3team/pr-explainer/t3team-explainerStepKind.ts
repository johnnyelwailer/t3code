import type { T3TeamExplainerStep, T3TeamExplainerStepKind } from "./model/t3team-explainer";
import {
  FlaskConicalIcon,
  HistoryIcon,
  PencilLineIcon,
  TriangleAlertIcon,
} from "./t3team-explainerHostKit";

/** One tone per step kind, shared by the rail, the caption and the header's "to check" count. */
export const EXPLAINER_STEP_KIND = {
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
} as const satisfies Record<T3TeamExplainerStepKind, unknown>;

const LABEL_WORDS = 2;

/**
 * The step's short rail label. A model may leave it out: then a caption that leads with a word
 * and a colon ("Check: the key…") gives that word, and anything else its first words.
 */
export function explainerStepLabel(step: Pick<T3TeamExplainerStep, "label" | "caption">): string {
  if (step.label) return step.label;
  const lead = /^([^:.!?]{1,24}):\s/.exec(step.caption)?.[1];
  if (lead) return lead.trim();
  const words = step.caption.split(/\s+/).filter((word) => !/^(the|a|an)$/i.test(word));
  const label = words
    .slice(0, LABEL_WORDS)
    .join(" ")
    .replace(/[.,;:!?]+$/, "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
