import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import {
  EMPTY_CHILD_ISSUE_CREATE_DRAFT,
  type ChildIssueCreateDraft,
} from "~/t3team/t3team-childIssueCreateTypes";
import { parseWorkItemEstimateDraft } from "~/t3team/workitem/t3team-workItemEstimateParsing";

/** The work-item Children section's create-draft state + submit, mirroring what
 * `ProjectBacklogRowSubtaskCell` does inline — split out here purely to keep
 * `WorkItemChildren.tsx` under the additive-guard line cap. */
export function useWorkItemChildCreate(input: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly projectId: string;
  readonly parentIssueIdOrKey: string;
  readonly onReload: () => void;
}) {
  const [draft, setDraft] = useState<ChildIssueCreateDraft>(EMPTY_CHILD_ISSUE_CREATE_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setError(null);
    setDraft(EMPTY_CHILD_ISSUE_CREATE_DRAFT);
  }

  async function submit(): Promise<boolean> {
    const summary = draft.summary.trim();
    if (!summary) {
      setError("Child issue title is required.");
      return false;
    }
    const parsedEstimate = parseWorkItemEstimateDraft(draft.estimateHours);
    if (!parsedEstimate.ok) {
      setError(parsedEstimate.error);
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      await input.backend.createSubtask({
        accountId: input.accountId,
        projectId: input.projectId,
        parentIssueIdOrKey: input.parentIssueIdOrKey,
        summary,
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
        ...(parsedEstimate.value !== null ? { estimateHours: parsedEstimate.value } : {}),
        ...(draft.issueTypeId ? { issueTypeId: draft.issueTypeId } : {}),
        ...(draft.assignee ? { assigneeAccountId: draft.assignee.accountId } : {}),
      });
      reset();
      input.onReload();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create the child issue.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { draft, setDraft, saving, error, submit, reset };
}
