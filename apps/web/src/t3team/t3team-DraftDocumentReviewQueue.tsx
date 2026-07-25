import { DraftDocumentReviewPanel } from "~/t3team/t3team-DraftDocumentReviewPanel";
import type { T3TeamDocumentDraftMutation } from "~/t3team/t3team-draftMutationTypes";

type DraftDocumentReviewQueueProps = {
  readonly drafts: readonly T3TeamDocumentDraftMutation[];
  readonly onApply?: (draft: T3TeamDocumentDraftMutation) => Promise<void> | void;
  readonly onDiscard: (draft: T3TeamDocumentDraftMutation) => void;
};

export function DraftDocumentReviewQueue({
  drafts,
  onApply,
  onDiscard,
}: DraftDocumentReviewQueueProps) {
  if (drafts.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Agent document drafts">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Agent-proposed Jira changes
        </p>
        <h2 className="text-base font-semibold">Review document drafts before saving</h2>
      </div>
      {drafts.map((draft) => (
        <DraftDocumentReviewPanel
          key={draft.id}
          draft={draft}
          {...(onApply ? { onApply } : {})}
          onDiscard={onDiscard}
        />
      ))}
    </section>
  );
}
