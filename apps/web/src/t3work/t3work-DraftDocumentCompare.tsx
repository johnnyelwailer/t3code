import { useMemo } from "react";
import { cn } from "~/lib/utils";
import { T3SurfacePanel } from "~/t3work/components/ui/t3work-surface";
import { buildDraftTextDiff, type T3WorkDraftDiffRow } from "~/t3work/t3work-draftMutationDiff";
import type { T3WorkDocumentDraftMutation } from "~/t3work/t3work-draftMutationTypes";

const rowClasses: Record<T3WorkDraftDiffRow["type"], string> = {
  unchanged: "text-muted-foreground",
  added: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  removed: "bg-destructive/10 text-destructive",
};

const rowPrefix: Record<T3WorkDraftDiffRow["type"], string> = {
  unchanged: " ",
  added: "+",
  removed: "-",
};

export function DraftDocumentCompare({ draft }: { draft: T3WorkDocumentDraftMutation }) {
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
