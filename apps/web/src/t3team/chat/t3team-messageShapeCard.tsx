/* oxlint-disable react/no-array-index-key -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The play-as-shape "plan" card (recipe-UX design pass) — renders the `t3team.workflow.shape`
 * view a recipe-launch system message carries: a distinct bordered card showing WHAT THE RECIPE
 * WILL DO. The workflow title sits at the top, then the ordered, kind-marked step list with
 * phase headers immediately before the relevant steps. Each step carries the four-kind
 * icon/color vocabulary (read / agent / ask / act).
 *
 * Read-only display — no clicks, no editing (the talk-to-edit creation loop is the authoring SDK
 * later). The creation-review card reuses this same renderer over a derived (not-yet-saved)
 * shape; see {@link ./t3team-messageDecisionCard.tsx} for the sibling `askUser` card chrome.
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
  type ProjectRecipeWorkflowShapeStep,
  type ProjectRecipeWorkflowStepKind,
} from "@t3tools/project-recipes";

import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { T3TeamShapeCapabilityChips } from "~/t3team/chat/t3team-messageShapeCardCapabilities";
import type { ChatMessage } from "~/types";

export function getT3TeamWorkflowShapeAttachment(
  message: Pick<ChatMessage, "t3teamExt">,
): ProjectRecipeWorkflowShapePayload | null {
  for (const attachment of message.t3teamExt?.attachments ?? []) {
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

/**
 * Make only contiguous phase groups. This deliberately follows authored step order: a later
 * return to an earlier phase gets a new header instead of moving that work up the list.
 */
export function groupT3TeamShapeSteps(shape: ProjectRecipeWorkflowShapePayload) {
  const groups: Array<{ title: string | null; steps: ProjectRecipeWorkflowShapeStep[] }> = [];
  for (const step of shape.steps) {
    const previous = groups.at(-1);
    if (previous?.title === step.phase) {
      previous.steps.push(step);
    } else {
      groups.push({ title: step.phase, steps: [step] });
    }
  }
  return groups;
}

export function T3TeamShapeStepRow({
  step,
  leading,
  trailing,
  hideKindLabel = false,
}: {
  step: ProjectRecipeWorkflowShapePayload["steps"][number];
  /** Optional live-status slot (spinner/check/clock/error) rendered before the kind icon. */
  leading?: ReactNode;
  /** Optional compact live metadata aligned at the right edge. */
  trailing?: ReactNode;
  /** Live metadata may replace the redundant kind badge to keep the row compact. */
  hideKindLabel?: boolean;
}) {
  const meta = KIND_META[step.kind];
  return (
    <div className="flex items-center gap-2.5">
      {leading}
      <span
        className={cn("flex size-5 shrink-0 items-center justify-center", meta.text)}
        title={step.kind === "agent" ? "Agent step" : undefined}
      >
        <meta.Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{step.label}</span>
      {trailing}
      {!hideKindLabel && step.kind !== "agent" ? (
        <span
          className={cn(
            "shrink-0 rounded-full border border-border/55 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            meta.text,
          )}
        >
          {meta.label}
        </span>
      ) : null}
    </div>
  );
}

export function T3TeamWorkflowShapeCard({ shape }: { shape: ProjectRecipeWorkflowShapePayload }) {
  const groups = groupT3TeamShapeSteps(shape);
  return (
    <div className="rounded-lg border border-primary/35 bg-background/65 px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-primary">
        <RouteIcon className="size-3.5" />
        {shape.name ? (
          <span className="text-sm font-semibold text-foreground">{shape.name}</span>
        ) : null}
      </div>
      {shape.description ? (
        <p className="text-sm leading-6 text-muted-foreground">{shape.description}</p>
      ) : null}
      <T3TeamShapeCapabilityChips capabilities={shape.capabilities} />

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
                <T3TeamShapeStepRow key={`step:${index}:${stepIndex}`} step={step} />
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
