import type { PendingDraftProject } from "./t3team-pendingDraftTypes";

export interface OpenPendingDraftSteps {
  readonly waitForDrafts: () => Promise<void>;
  readonly createDraft: (project: PendingDraftProject) => string;
  readonly openDraft: (draftKey: string, project: PendingDraftProject) => void;
}

/** Creates the draft, lets the caller register its key, and only then opens it. */
export async function openPendingDraft(
  steps: OpenPendingDraftSteps,
  project: PendingDraftProject,
  onCreated?: (draftKey: string) => void,
): Promise<string> {
  await steps.waitForDrafts();
  const draftKey = steps.createDraft(project);
  onCreated?.(draftKey);
  steps.openDraft(draftKey, project);
  return draftKey;
}
