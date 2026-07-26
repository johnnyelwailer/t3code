import { useMemo } from "react";
import { cn } from "~/lib/utils";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { buildDraftTextDiff, type T3TeamDraftDiffRow } from "~/t3team/t3team-draftMutationDiff";
import type { T3TeamDocumentDraftMutation } from "~/t3team/t3team-draftMutationTypes";

/**
 * Semantic tokens throughout. The added row was `emerald-500`/`emerald-700`/`emerald-300`, a palette
 * colour a workspace theme cannot rebind — and it sat next to a `destructive` removed row that could,
 * so the pair drifted apart under any custom theme.
 */
const rowClasses: Record<T3TeamDraftDiffRow["type"], string> = {
  unchanged: "text-muted-foreground",
  added: "bg-success/10 text-success-foreground",
  removed: "bg-destructive/10 text-destructive",
};

const rowPrefix: Record<T3TeamDraftDiffRow["type"], string> = {
  unchanged: " ",
  added: "+",
  removed: "-",
};

export function DraftDocumentCompare({ draft }: { draft: T3TeamDocumentDraftMutation }) {
  const rows = useMemo(
    () =>
      buildDraftTextDiff({
        ...(draft.currentContent ? { current: draft.currentContent } : {}),
        proposed: draft.proposedContent,
      }),
    [draft.currentContent, draft.proposedContent],
  );
  const keyedRows = useMemo(() => {
    const seen = new Map<string, number>();
    return rows.map((row) => {
      const baseKey = `${row.type}:${row.text}`;
      const occurrence = seen.get(baseKey) ?? 0;
      seen.set(baseKey, occurrence + 1);
      return { row, key: `${baseKey}:${occurrence}` };
    });
  }, [rows]);

  if (rows.length === 0) {
    return (
      <T3SurfacePanel tone="inset" className="p-3 text-sm text-muted-foreground">
        The proposed document has no text content.
      </T3SurfacePanel>
    );
  }

  return (
    <T3SurfacePanel tone="inset" className="overflow-hidden">
      <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
        Text compare preview
      </div>
      <pre className="max-h-[28rem] overflow-auto p-0 text-xs leading-5">
        {keyedRows.map(({ row, key }) => (
          <div
            key={key}
            className={cn("grid grid-cols-[1.75rem_1fr] gap-2 px-3 py-0.5", rowClasses[row.type])}
          >
            <span className="select-none text-right font-mono">{rowPrefix[row.type]}</span>
            <span className="whitespace-pre-wrap break-words font-mono">{row.text || " "}</span>
          </div>
        ))}
      </pre>
    </T3SurfacePanel>
  );
}
