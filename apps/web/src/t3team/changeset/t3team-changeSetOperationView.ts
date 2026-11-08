import type { T3TeamDraftMutationPayload } from "@t3tools/contracts";

import type { OperationOutcome } from "~/t3team/changeset/t3team-changeSetApply";
import type { ChangeSetOperationState } from "~/t3team/changeset/t3team-changeSetModel";
import type { Decision } from "~/t3team/changeset/t3team-changeSetSelection";
import { normalizeT3TeamDraftMutation } from "~/t3team/t3team-draftMutationModel";
import type { T3TeamScalarDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import {
  readAssigneeDraftPatch,
  readLinkDraftPatch,
  readStatusDraftPatch,
  readSubtaskDraftPatch,
} from "~/t3team/workitem/t3team-workItemDraftPatchReaders";
import {
  documentFieldLabel,
  scalarFieldLabel,
} from "~/t3team/workitem/t3team-workItemDraftStripRowContent";
import { readString } from "~/t3team/workitem/t3team-workItemFieldReaders";

export type OperationView = {
  readonly fieldLabel: string;
  /** What the change does, read from the member draft's patch. */
  readonly summary: string;
  /** Full proposed prose for description and comment drafts. */
  readonly body?: string;
  readonly words?: number;
};

/** Mirrors the suffixes of `getProjectTicketEstimatePresentation`; the thread has no ProjectTicket. */
function estimateLine(patch: Record<string, unknown>): string {
  const value = patch.estimateValue;
  const suffix = patch.estimateMode === "hours" ? "H" : "SP";
  return typeof value === "number" ? `${String(value)} ${suffix}` : "Clear estimate";
}

function scalarSummary(draft: T3TeamScalarDraftMutation): string {
  switch (draft.field) {
    case "status":
      return `To ${readStatusDraftPatch(draft) ?? "?"}`;
    case "assignee": {
      const to = readAssigneeDraftPatch(draft);
      return to === undefined ? "Change assignee" : `To ${to?.displayName ?? "Unassigned"}`;
    }
    case "estimate":
      return estimateLine(draft.patch);
    case "link": {
      const link = readLinkDraftPatch(draft);
      if (!link) return "Change link";
      return link.action === "remove"
        ? "Remove link"
        : `${link.linkTypeName} ${link.otherIssueIdOrKey}`;
    }
    case "subtask":
      return readSubtaskDraftPatch(draft)?.summary ?? "New subtask";
  }
}

/** The row content of one member draft; falls back to its own summary for an unreadable patch. */
export function describeOperation(payload: T3TeamDraftMutationPayload): OperationView {
  const draft = normalizeT3TeamDraftMutation({ raw: payload });
  if (!draft) {
    return {
      fieldLabel: payload.field,
      summary: readString(payload.summary) ?? "Unreadable change",
    };
  }
  if ("proposedContent" in draft) {
    const body = draft.proposedContent.body;
    return {
      fieldLabel: documentFieldLabel(draft.field),
      summary: readString(draft.summary) ?? "",
      body,
      words: body.split(/\s+/).filter(Boolean).length,
    };
  }
  return { fieldLabel: scalarFieldLabel(draft.field), summary: scalarSummary(draft) };
}

export type OperationBadge = {
  readonly label: string;
  readonly variant: "info" | "success" | "warning" | "error" | "secondary";
};

const REFUSED_LABELS: Partial<Record<ChangeSetOperationState, string>> = {
  missing: "Missing",
  changed: "Changed since proposed",
  duplicate: "Duplicate",
};

/** What the reviewer sees for one operation: this session's outcome wins, then the decision, then the state. */
export function operationBadge(
  state: ChangeSetOperationState,
  outcome: OperationOutcome | undefined,
  decision: Decision,
): OperationBadge {
  switch (outcome?.status) {
    case "failed":
      return { label: "Failed", variant: "error" };
    case "unsupported":
      return { label: "Apply from the item view", variant: "warning" };
    case "blocked":
      return { label: "Not attempted", variant: "warning" };
    case "uncertain":
      return { label: "May already be applied", variant: "warning" };
    case "unrecorded":
      return { label: "Applied, not recorded", variant: "warning" };
    case "refused":
      return { label: REFUSED_LABELS[state] ?? "Refused", variant: "error" };
  }
  if (decision === "reject" && (state === "draft" || state === "changed")) {
    return { label: "Rejected", variant: "secondary" };
  }
  switch (state) {
    case "applied":
      return { label: "Applied", variant: "success" };
    case "dismissed":
      return { label: "Dismissed", variant: "secondary" };
    case "missing":
    case "changed":
    case "duplicate":
      return {
        label: REFUSED_LABELS[state] ?? "",
        variant: state === "changed" ? "warning" : "error",
      };
    case "draft":
      return { label: "Proposed", variant: "info" };
  }
}
