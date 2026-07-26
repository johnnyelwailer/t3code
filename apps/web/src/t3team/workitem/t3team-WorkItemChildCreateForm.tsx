import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import {
  toUserFacingError,
  type T3TeamUserFacingError,
} from "~/t3team/components/error/t3team-errorMessage";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Input } from "~/t3team/components/ui/t3team-input";

/**
 * "Add a child issue" — reuses `backend.createSubtask` (the same call the backlog's own subtask
 * form makes) rather than a second creation path, per the redesign's "one write path" rule. Kept
 * as a small local-state creation form like `WorkItemCommentComposer`/`WorkItemLinkCreateForm`.
 */
export function WorkItemChildCreateForm({
  backend,
  accountId,
  projectId,
  parentIssueIdOrKey,
  onReload,
  onDone,
}: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly projectId: string;
  readonly parentIssueIdOrKey: string;
  readonly onReload: () => void;
  readonly onDone: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<T3TeamUserFacingError | null>(null);

  async function submit() {
    const trimmed = summary.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await backend.createSubtask({
        accountId,
        projectId,
        parentIssueIdOrKey,
        summary: trimmed,
      });
      setSummary("");
      onReload();
      onDone();
    } catch (cause) {
      setError(toUserFacingError(cause, { action: "creating the child issue" }));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-border/70 bg-card/30 p-2.5">
      <Input
        autoFocus
        aria-label={`Child issue title for ${parentIssueIdOrKey}`}
        value={summary}
        disabled={pending}
        size="sm"
        placeholder={`New child issue under ${parentIssueIdOrKey}`}
        onChange={(event) => setSummary(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onDone();
          }
        }}
      />
      {error ? <T3TeamErrorStateInline userFacing={error} showRetry={false} /> : null}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="xs" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={pending || !summary.trim()}
          onClick={() => void submit()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
