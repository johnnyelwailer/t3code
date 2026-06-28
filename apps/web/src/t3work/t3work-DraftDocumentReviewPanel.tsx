import { CheckCircle2, FileText, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "~/t3work/components/ui/t3work-badge";
import { Button } from "~/t3work/components/ui/t3work-button";
import {
  T3SurfaceCard,
  T3SurfaceCardContent,
  T3SurfacePanel,
} from "~/t3work/components/ui/t3work-surface";
import { DraftDocumentCompare } from "~/t3work/t3work-DraftDocumentCompare";
import { DraftDocumentContent } from "~/t3work/t3work-DraftDocumentContent";
import type { T3WorkDocumentDraftMutation } from "~/t3work/t3work-draftMutationTypes";

type DraftDocumentReviewPanelProps = {
  readonly draft: T3WorkDocumentDraftMutation;
  readonly onApply?: (draft: T3WorkDocumentDraftMutation) => Promise<void> | void;
  readonly onDiscard: (draft: T3WorkDocumentDraftMutation) => void;
};

function fieldLabel(field: T3WorkDocumentDraftMutation["field"]): string {
  return field === "description" ? "Description update" : "New comment";
}

export function DraftDocumentReviewPanel({
  draft,
  onApply,
  onDiscard,
}: DraftDocumentReviewPanelProps) {
  const [mode, setMode] = useState<"rendered" | "compare">("rendered");
  const isBusy = draft.status === "applying";
  const canApply = Boolean(onApply) && !isBusy && draft.status !== "error";
  const unavailableReason =
    draft.applyUnavailableReason ??
    (!onApply ? "No Jira description/comment write route is wired yet." : undefined);

  return (
    <T3SurfaceCard className="overflow-hidden border-primary/25 bg-primary/4">
      <T3SurfaceCardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Agent draft</Badge>
              <Badge variant={draft.field === "description" ? "info" : "secondary"}>
                {fieldLabel(draft.field)}
              </Badge>
              {draft.status === "applied" ? <Badge variant="success">Applied</Badge> : null}
              {draft.status === "error" ? (
                <Badge variant="destructive">Needs attention</Badge>
              ) : null}
            </div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-primary" />
              <span className="truncate">
                {draft.target.issueIdOrKey}
                {draft.target.title ? `: ${draft.target.title}` : ""}
              </span>
            </h3>
            {draft.summary ? (
              <p className="text-xs text-muted-foreground">{draft.summary}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={mode === "rendered" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setMode("rendered")}
            >
              Rendered
            </Button>
            <Button
              type="button"
              variant={mode === "compare" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setMode("compare")}
            >
              Compare
            </Button>
          </div>
        </div>

        {mode === "compare" ? (
          <DraftDocumentCompare draft={draft} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <T3SurfacePanel tone="inset" className="space-y-2 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Current
              </h4>
              <DraftDocumentContent content={draft.currentContent} />
            </T3SurfacePanel>
            <T3SurfacePanel tone="default" className="space-y-2 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Proposed
              </h4>
              <DraftDocumentContent content={draft.proposedContent} />
            </T3SurfacePanel>
          </div>
        )}

        {draft.error ? <p className="text-sm text-destructive">{draft.error}</p> : null}
        {unavailableReason ? (
          <p className="text-xs text-muted-foreground">{unavailableReason}</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => onDiscard(draft)}>
            <Trash2 className="size-3.5" />
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canApply}
            onClick={() => void onApply?.(draft)}
          >
            {isBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            Apply / Save
          </Button>
        </div>
      </T3SurfaceCardContent>
    </T3SurfaceCard>
  );
}
