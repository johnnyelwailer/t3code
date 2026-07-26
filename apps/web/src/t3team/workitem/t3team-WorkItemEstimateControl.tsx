import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import { Input } from "~/t3team/components/ui/t3team-input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/t3team/components/ui/t3team-popover";
import { Spinner } from "~/t3team/components/ui/t3team-spinner";
import { cn } from "~/t3team/lib/t3team-utils";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { useWorkItemFieldDraftOverlay } from "~/t3team/workitem/t3team-useWorkItemFieldDraftOverlay";
import { useWorkItemFieldMutation } from "~/t3team/workitem/t3team-useWorkItemFieldMutation";
import { WorkItemFieldOverlay } from "~/t3team/workitem/t3team-WorkItemFieldOverlay";
import { readEstimatePointsDraftPatch } from "~/t3team/workitem/t3team-workItemDraftPatchReaders";
import { parseWorkItemEstimateDraft } from "~/t3team/workitem/t3team-workItemEstimateParsing";

/**
 * Story points, made interactive: the value itself is the trigger (same shape as status and
 * assignee) for a small popover with a single input. Opening never commits — only Enter, or the
 * Save button, does. Escape and clicking away both discard the draft; blur is deliberately never
 * wired to save, since a stray click elsewhere would otherwise write a half-typed number.
 *
 * Always mode "points" — this control edits the "Points" property specifically, never the
 * hour-tracked original estimate, which stays read-only.
 */
export function WorkItemEstimateControl({
  backend,
  accountId,
  issueIdOrKey,
  storyPoints,
  agentDraft,
  onReload,
  className,
}: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly storyPoints: number | undefined;
  /** A pending agent-proposed points update for this issue, if any. Named to avoid colliding with
   *  the popover's own local `draft` (the not-yet-committed input text) below. */
  readonly agentDraft?: T3TeamScalarDraftMutation | undefined;
  readonly onReload: () => void;
  readonly className?: string;
}) {
  const mutation = useWorkItemFieldMutation<number | null>({
    value: storyPoints ?? null,
    action: "updating story points",
    mutate: async (nextValue) => {
      await backend.updateIssueEstimate({
        accountId,
        issueIdOrKey,
        estimateValue: nextValue,
        estimateMode: "points",
      });
      onReload();
    },
  });

  const committedText = mutation.value !== null ? String(mutation.value) : "";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(committedText);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraft(committedText);
      setValidationError(null);
    }
  }

  function commitDraft() {
    const parsed = parseWorkItemEstimateDraft(draft);
    if (!parsed.ok) {
      setValidationError(parsed.error);
      return;
    }
    setOpen(false);
    if (parsed.value !== mutation.value) mutation.commit(parsed.value);
  }

  function cancelDraft() {
    setDraft(committedText);
    setValidationError(null);
    setOpen(false);
  }

  const proposedPoints = agentDraft ? readEstimatePointsDraftPatch(agentDraft) : undefined;
  const { marker, overlay } = useWorkItemFieldDraftOverlay({
    mutation,
    draft: agentDraft,
    proposedValue: proposedPoints,
    proposedLabel: proposedPoints !== undefined ? String(proposedPoints ?? "—") : undefined,
    fieldLabel: "story points",
    undoLabel: mutation.lastChange ? `Points → ${mutation.lastChange.to ?? "—"}` : undefined,
  });

  return (
    <WorkItemFieldOverlay overlay={overlay} className={className}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          aria-label={`Story points: ${committedText || "not set"}. Change story points.`}
          aria-busy={mutation.pending}
          disabled={mutation.pending}
          className="-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 leading-none tabular-nums outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className={cn(!committedText && "text-muted-foreground")}>
            {committedText || "—"}
          </span>
          {marker}
          {mutation.pending ? <Spinner className="size-3" /> : null}
        </PopoverTrigger>
        <PopoverPopup align="start" side="bottom" className="w-48 p-3">
          <label
            className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            htmlFor={`estimate-${issueIdOrKey}`}
          >
            Story points
          </label>
          <Input
            id={`estimate-${issueIdOrKey}`}
            inputMode="decimal"
            type="text"
            size="sm"
            value={draft}
            aria-invalid={validationError ? true : undefined}
            autoFocus
            onChange={(event) => {
              setDraft(event.target.value);
              setValidationError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelDraft();
              }
            }}
          />
          <p
            className={cn(
              "mt-1.5 text-xs",
              validationError ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {validationError ?? "Enter to save · Esc to cancel"}
          </p>
        </PopoverPopup>
      </Popover>
    </WorkItemFieldOverlay>
  );
}
