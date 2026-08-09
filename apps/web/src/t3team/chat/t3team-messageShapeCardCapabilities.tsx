/**
 * Capability disclosure for the play-as-shape "plan" card — the pre-execution permission
 * surface (Epic 25 §Capability gating): before an orchestration with elevated capabilities runs,
 * the user sees WHAT IT MAY DO as a compact chip row on the launch card. Engine feature
 * strings render via the engine's own label table below; tool-group refs render their
 * author-declared `label` (with `description` as the hover title). Disclosure-only — the
 * spec defines no confirmation gate for this surface, so none is invented here.
 *
 * Visually quiet by design: an orchestration that declares no capabilities renders nothing.
 */
import { ShieldIcon } from "lucide-react";
import type { ProjectRecipeWorkflowCapability } from "@t3tools/project-recipes";

/**
 * The engine's label table for feature-string capabilities (spec 25 §Capability gating;
 * `"schedule"` wording from Epic 27 §Capability and limits — "this can run on a timer,
 * even when you're away").
 */
const ENGINE_CAPABILITY_LABELS: Record<string, { label: string; description: string }> = {
  thread: {
    label: "Message this thread",
    description: "Send messages into this conversation while it runs.",
  },
  child: {
    label: "Spawn child threads",
    description: "Start child agent threads that work on its behalf.",
  },
  user: {
    label: "Ask & notify you",
    description: "Ask you questions and send you notifications while it runs.",
  },
  script: {
    label: "Run recipe scripts",
    description: "Execute scripts registered by this recipe on your machine.",
  },
  ui: {
    label: "Show views",
    description: "Display interactive views inside this thread.",
  },
  workflow: {
    label: "Run sub-orchestrations",
    description: "Invoke other orchestrations as part of this run.",
  },
  schedule: {
    label: "Run on a timer",
    description: "Can run on a timer, even when you're away.",
  },
};

/**
 * The same table, for tool GROUPS.
 *
 * A group id is a permission namespace, not a sentence: `mutation.draft` sat in the chip row next to
 * "Ask & notify you" and read as a leaked internal. Groups can carry an author-declared label, but the
 * bundled ones do not — they are declared as bare strings in a workflow's `meta.capabilities` — so
 * without a table here the id IS the label for every recipe in the product.
 *
 * Written in the same voice as the engine labels: what it may do TO YOUR WORK, and what it cannot.
 */
const TOOL_GROUP_CAPABILITY_LABELS: Record<string, { label: string; description: string }> = {
  "integration.read": {
    label: "Read your work items",
    description: "Read issues, comments, and attachments from your connected tools. Read-only.",
  },
  "mutation.draft": {
    label: "Propose changes you review",
    description:
      "Prepare changes as drafts for you to accept or reject. Nothing is saved to your connected tools without your approval.",
  },
  "mutation.write": {
    label: "Save changes directly",
    description: "Write changes straight to your connected tools without a review step.",
  },
  "repo.read": {
    label: "Read this repository",
    description: "Read files in the project workspace. Read-only.",
  },
  "repo.write": {
    label: "Edit files in this repository",
    description: "Create and modify files in the project workspace.",
  },
};

/** Human-friendly text for one declared capability. Author-declared text wins; the tables fill the
 * gap; the raw id is the last resort rather than the norm. */
export function describeT3TeamShapeCapability(capability: ProjectRecipeWorkflowCapability): {
  label: string;
  description: string | undefined;
} {
  if (capability.kind === "feature") {
    const known = ENGINE_CAPABILITY_LABELS[capability.id];
    return known ?? { label: capability.id, description: undefined };
  }

  const known = TOOL_GROUP_CAPABILITY_LABELS[capability.id];
  return {
    label: capability.label ?? known?.label ?? capability.id,
    description: capability.description ?? known?.description,
  };
}

/**
 * The chip row itself. Renders nothing for a capability-less run — the quiet default —
 * so the plan card stays unchanged unless there is something to disclose.
 */
export function T3TeamShapeCapabilityChips({
  capabilities,
}: {
  capabilities: ReadonlyArray<ProjectRecipeWorkflowCapability> | undefined;
}) {
  if (capabilities === undefined || capabilities.length === 0) {
    return null;
  }
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span
        className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/65"
        title="This orchestration declared these capabilities; they are granted for this run."
      >
        <ShieldIcon className="size-3" />
        May
      </span>
      {capabilities.map((capability) => {
        const { label, description } = describeT3TeamShapeCapability(capability);
        return (
          <span
            key={`${capability.kind}:${capability.id}`}
            className="shrink-0 rounded-full border border-border/55 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/80"
            title={description}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
