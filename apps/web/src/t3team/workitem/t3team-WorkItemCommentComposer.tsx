import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import {
  toUserFacingError,
  type T3TeamUserFacingError,
} from "~/t3team/components/error/t3team-errorMessage";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { Button } from "~/t3team/components/ui/t3team-button";
import { CommentBodyEditor } from "~/t3team/workitem/t3team-CommentBodyEditor";

/**
 * "Add a comment" — a creation form, not a field edit, so it keeps its own small pending/error
 * state (matching `ProjectBacklogSubtaskCreateForm`) rather than forcing an append onto
 * `useWorkItemFieldMutation`, which models replacing one field's value, not growing a list.
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
  const [cursor, setCursor] = useState(0);
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
      setCursor(0);
      onReload();
    } catch (cause) {
      setError(toUserFacingError(cause, { action: "adding the comment" }));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <CommentBodyEditor
        value={body}
        cursor={cursor}
        onChange={(nextValue, nextCursor) => {
          setBody(nextValue);
          setCursor(nextCursor);
        }}
        onSubmit={() => void submit()}
        disabled={pending}
        placeholder="Add a comment… (⌘/Ctrl + Enter to send)"
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
