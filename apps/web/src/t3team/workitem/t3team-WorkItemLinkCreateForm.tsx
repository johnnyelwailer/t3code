import { useEffect, useState } from "react";

import type {
  AtlassianBackendApi,
  AtlassianIssueLinkType,
} from "~/t3team/backend/t3team-atlassianBackendTypes";
import {
  toUserFacingError,
  type T3TeamUserFacingError,
} from "~/t3team/components/error/t3team-errorMessage";
import { T3TeamErrorStateInline } from "~/t3team/components/error/t3team-ErrorStateInline";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Input } from "~/t3team/components/ui/t3team-input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/t3team/components/ui/t3team-select";

/**
 * "Add a link" — a creation form, kept as plain local state like `ProjectBacklogSubtaskCreateForm`
 * and `WorkItemCommentComposer`: there is no existing field value to optimistically replace, so
 * `useWorkItemFieldMutation` doesn't apply here. Direction picks which side of the link type the
 * current issue is on, phrased in Jira's own inward/outward wording.
 */
export function WorkItemLinkCreateForm({
  backend,
  accountId,
  issueIdOrKey,
  onReload,
  onDone,
}: {
  readonly backend: AtlassianBackendApi;
  readonly accountId: string;
  readonly issueIdOrKey: string;
  readonly onReload: () => void;
  readonly onDone: () => void;
}) {
  const [linkTypes, setLinkTypes] = useState<ReadonlyArray<AtlassianIssueLinkType>>([]);
  const [linkTypeId, setLinkTypeId] = useState<string | undefined>(undefined);
  const [direction, setDirection] = useState<"inward" | "outward">("outward");
  const [otherIssueIdOrKey, setOtherIssueIdOrKey] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<T3TeamUserFacingError | null>(null);

  useEffect(() => {
    let cancelled = false;
    backend
      .listIssueLinkTypes({ accountId })
      .then((types) => {
        if (cancelled) return;
        setLinkTypes(types);
        setLinkTypeId((current) => current ?? types[0]?.id);
      })
      .catch(() => {
        // A failed link-type load just leaves the picker empty; the field-level error below
        // covers submit failures, and there's nothing to retry inline for a picker.
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, backend]);

  const selectedType = linkTypes.find((type) => type.id === linkTypeId);

  async function submit() {
    const otherKey = otherIssueIdOrKey.trim();
    if (!otherKey || !selectedType || pending) return;
    setPending(true);
    setError(null);
    try {
      await backend.createIssueLink({
        accountId,
        issueIdOrKey,
        otherIssueIdOrKey: otherKey,
        linkTypeName: selectedType.name,
        direction,
      });
      onReload();
      onDone();
    } catch (cause) {
      setError(toUserFacingError(cause, { action: "linking the issue" }));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-card/30 p-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={linkTypeId ?? null}
          onValueChange={(value) => value && setLinkTypeId(value)}
        >
          <SelectTrigger size="sm" aria-label="Link type" disabled={pending}>
            <SelectValue placeholder="Link type" />
          </SelectTrigger>
          <SelectPopup>
            {linkTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>

        <Input
          aria-label="Other issue key"
          value={otherIssueIdOrKey}
          disabled={pending}
          size="sm"
          placeholder="Issue key, e.g. T3T-42"
          onChange={(event) => setOtherIssueIdOrKey(event.target.value)}
        />
      </div>

      {selectedType ? (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Button
            type="button"
            size="xs"
            variant={direction === "outward" ? "secondary" : "ghost"}
            disabled={pending}
            onClick={() => setDirection("outward")}
          >
            {issueIdOrKey} {selectedType.outward} {otherIssueIdOrKey || "…"}
          </Button>
          <Button
            type="button"
            size="xs"
            variant={direction === "inward" ? "secondary" : "ghost"}
            disabled={pending}
            onClick={() => setDirection("inward")}
          >
            {issueIdOrKey} {selectedType.inward} {otherIssueIdOrKey || "…"}
          </Button>
        </div>
      ) : null}

      {error ? <T3TeamErrorStateInline userFacing={error} showRetry={false} /> : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="xs" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={pending || !otherIssueIdOrKey.trim() || !selectedType}
          onClick={() => void submit()}
        >
          Link
        </Button>
      </div>
    </div>
  );
}
