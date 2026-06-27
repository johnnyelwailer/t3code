/* oxlint-disable react/no-array-index-key -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The play-as-shape "plan" card (recipe-UX design pass) — renders the `t3work.workflow.shape`
 * view a recipe-launch system message carries: a distinct bordered card showing WHAT THE RECIPE
 * WILL DO. A phase strip across the top, then the ordered, kind-tagged step list grouped by
 * phase, each step badged with the four-kind icon/color vocabulary (read / agent / ask / act).
 *
 * Read-only display — no clicks, no editing (the talk-to-edit creation loop is the authoring SDK
 * later). The creation-review card reuses this same renderer over a derived (not-yet-saved)
 * shape; see {@link ./t3work-messageDecisionCard.tsx} for the sibling `askUser` card chrome.
 */
import {
  BotIcon,
  CircleHelpIcon,
  EyeIcon,
  type LucideIcon,
  RouteIcon,
  ZapIcon,
} from "lucide-react";
import {
  isProjectRecipeWorkflowShapePayload,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
  type ProjectRecipeWorkflowShapePayload,
  type ProjectRecipeWorkflowStepKind,
} from "@t3tools/project-recipes";

import { cn } from "~/lib/utils";
import type { ChatMessage } from "~/types";

export function getT3workWorkflowShapeAttachment(
  message: Pick<ChatMessage, "t3workExt">,
): ProjectRecipeWorkflowShapePayload | null {
  for (const attachment of message.t3workExt?.attachments ?? []) {
    if (attachment.kind !== "view") {
      continue;
    }
    if (attachment.miniappId !== PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE) {
      continue;
    }
    if (isProjectRecipeWorkflowShapePayload(attachment.props)) {
      return attachment.props;
    }
  }
  return null;
}

const KIND_META: Record<
  ProjectRecipeWorkflowStepKind,
  { label: string; Icon: LucideIcon; text: string; dot: string }
> = {
  read: { label: "Read", Icon: EyeIcon, text: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500" },
  agent: {
    label: "Agent",
    Icon: BotIcon,
    text: "text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  ask: {
    label: "Ask",
    Icon: CircleHelpIcon,
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  act: {
    label: "Act",
    Icon: ZapIcon,
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
};

/** Group steps under the declared phase strip; steps with no (or an unknown) phase lead. */
function groupSteps(shape: ProjectRecipeWorkflowShapePayload) {
  const titles = shape.phases.map((phase) => phase.title);
  const groups: Array<{ title: string | null; steps: ProjectRecipeWorkflowShapePayload["steps"] }> =
    [];
  const leading = shape.steps.filter((step) => step.phase === null || !titles.includes(step.phase));
  if (leading.length > 0) groups.push({ title: null, steps: leading });
  for (const title of titles) {
    const steps = shape.steps.filter((step) => step.phase === title);
    if (steps.length > 0) groups.push({ title, steps });
  }
  return groups;
}

function StepRow({ step }: { step: ProjectRecipeWorkflowShapePayload["steps"][number] }) {
  const meta = KIND_META[step.kind];
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("flex size-5 shrink-0 items-center justify-center", meta.text)}>
        <meta.Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{step.label}</span>
      <span
        className={cn(
          "shrink-0 rounded-full border border-border/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          meta.text,
        )}
      >
        {meta.label}
      </span>
    </div>
  );
}

export function T3workWorkflowShapeCard({ shape }: { shape: ProjectRecipeWorkflowShapePayload }) {
  const groups = groupSteps(shape);
  return (
    <div className="rounded-lg border border-primary/35 bg-background/65 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-primary">
        <RouteIcon className="size-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">The plan</span>
      </div>
      {shape.name ? <p className="text-sm font-semibold text-foreground">{shape.name}</p> : null}
      {shape.description ? (
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{shape.description}</p>
      ) : null}

      {shape.phases.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {shape.phases.map((phase, index) => (
            <span
              key={`phase:${index}:${phase.title}`}
              className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {index + 1}. {phase.title}
            </span>
          ))}
        </div>
      ) : null}

      {shape.steps.length > 0 ? (
        <div className="mt-3 space-y-3">
          {groups.map((group, index) => (
            <div key={`group:${index}:${group.title ?? "_"}`} className="space-y-1.5">
              {group.title ? (
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65">
                  {group.title}
                </p>
              ) : null}
              {group.steps.map((step, stepIndex) => (
                <StepRow key={`step:${index}:${stepIndex}`} step={step} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground/70">No steps to preview.</p>
      )}
    </div>
  );
}
