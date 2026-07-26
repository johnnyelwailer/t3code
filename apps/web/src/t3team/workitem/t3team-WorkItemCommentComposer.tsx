import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import {
  toUserFacingError,
  type T3TeamUserFacingError,
} from "~/t3team/components/error/t3team-errorMessage";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Textarea } from "~/t3team/components/ui/t3team-textarea";

/**
 * "Add a comment" — a creation form, not a field edit, so it keeps its own small pending/error
 * state (matching `ProjectBacklogSubtaskCreateForm`) rather than forcing an append onto
 * `useWorkItemFieldMutation`, which models replacing one field's value, not growing a list.
 * Clicking the button (or Cmd/Ctrl+Enter) is the only thing that submits — plain Enter still
 * inserts a newline, and blur never saves.
 */
export function WorkItemCommentComposer({
  backend,
  accountId,
  issueIdOrKey,
  onReload,
}: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly onReload: () => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<T3TeamUserFacingError | null>(null);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await backend.addIssueComment({ accountId, issueIdOrKey, body: trimmed });
      setBody("");
      onReload();
    } catch (cause) {
      setError(toUserFacingError(cause, { action: "adding the comment" }));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Textarea
        value={body}
        disabled={pending}
        rows={2}
        placeholder="Add a comment…"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        {error ? <T3TeamErrorStateInline userFacing={error} showRetry={false} /> : null}
        <Button
          type="button"
          size="xs"
          disabled={!body.trim() || pending}
          onClick={() => void submit()}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}
