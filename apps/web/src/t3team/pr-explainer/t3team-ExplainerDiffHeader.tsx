import type { T3TeamExplainerDiffBlock } from "./model/t3team-explainer";
import {
  Badge,
  Button,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CodeIcon,
} from "./t3team-explainerHostKit";
import { useExplainer } from "./t3team-explainerContext";
import { explainerDiffStats, type ExplainerNumberedLine } from "./t3team-explainerDiffLines";

const STATUS = {
  added: { label: "new", variant: "success" },
  deleted: { label: "deleted", variant: "error" },
  renamed: { label: "renamed", variant: "info" },
  modified: null,
} as const;

/** The file name, its status and counts, and the expand and Open in Code actions. */
export function ExplainerDiffHeader({
  block,
  firstChanged,
  canExpand,
  expanded,
  onToggleExpanded,
}: {
  block: T3TeamExplainerDiffBlock;
  firstChanged: ExplainerNumberedLine | undefined;
  canExpand: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { onOpenInCode, staleSha } = useExplainer();
  const name = block.path.split("/").at(-1) ?? block.path;
  const dir = block.path.slice(0, block.path.length - name.length);
  const status = STATUS[block.status];
  const stats = explainerDiffStats(block);
  return (
    <header className="flex items-center gap-1.5 border-b border-border/70 bg-muted/40 py-1 pr-1 pl-2.5">
      <div className="min-w-0 flex-1 truncate font-mono text-2xs">
        <span className="text-muted-foreground">{dir}</span>
        <span className="font-medium text-foreground">{name}</span>
      </div>
      {status ? (
        <Badge variant={status.variant} size="sm">
          {status.label}
        </Badge>
      ) : null}
      <span className="font-mono text-2xs tabular-nums">
        {stats.additions ? (
          <span className="text-diff-addition-foreground">+{stats.additions}</span>
        ) : null}
        {stats.deletions ? (
          <span className="ml-1 text-diff-deletion-foreground">−{stats.deletions}</span>
        ) : null}
      </span>
      {canExpand ? (
        <Button
          variant="ghost-muted"
          size="icon-micro"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide surrounding lines" : "Show surrounding lines"}
          onClick={onToggleExpanded}
        >
          {expanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
        </Button>
      ) : null}
      {onOpenInCode && firstChanged ? (
        <Button
          variant="ghost-muted"
          size="micro"
          aria-label={`Open ${name} in Code${staleSha ? " at the older commit" : ""}`}
          onClick={() =>
            onOpenInCode({
              path: block.path,
              line: firstChanged.newLine ?? firstChanged.oldLine ?? block.newStart,
              side: firstChanged.newLine === null ? "old" : "new",
              ...(staleSha ? { headSha: staleSha } : {}),
            })
          }
        >
          <CodeIcon />
          Code
        </Button>
      ) : null}
    </header>
  );
}
