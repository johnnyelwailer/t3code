import { Badge } from "~/t3work/components/ui/t3work-badge";
import {
  T3SurfaceCard,
  T3SurfaceCardContent,
  T3SurfacePanel,
} from "~/t3work/components/ui/t3work-surface";
import type { ResourceSnapshot } from "@t3tools/project-context";

interface TicketMetadataProps {
  snapshot: ResourceSnapshot | null;
  priority?: string | undefined;
  assignee?: string | undefined;
}

function readDisplayName(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>).displayName;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : undefined;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toRelativeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toLocaleDateString();
}

export function TicketMetadata({ snapshot, priority, assignee }: TicketMetadataProps) {
  const fields = snapshot?.fields as Record<string, unknown> | undefined;
  const reporter = readDisplayName(fields?.reporter);
  const labels = readStringList(fields?.labels);
  const updatedOn =
    toRelativeDate(typeof fields?.updated === "string" ? fields.updated : undefined) ??
    toRelativeDate(snapshot?.fetchedAt);

  return (
    <T3SurfaceCard>
      <T3SurfaceCardContent>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <T3SurfacePanel tone="default" className="rounded-md bg-background/85 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Assignee</p>
            <p className="mt-1 truncate font-medium text-foreground">{assignee ?? "Unassigned"}</p>
          </T3SurfacePanel>
          <T3SurfacePanel tone="default" className="rounded-md bg-background/85 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Reporter</p>
            <p className="mt-1 truncate font-medium text-foreground">{reporter ?? "Unknown"}</p>
          </T3SurfacePanel>
          <T3SurfacePanel tone="default" className="rounded-md bg-background/85 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Priority</p>
            <p className="mt-1 truncate font-medium text-foreground">{priority ?? "Unspecified"}</p>
          </T3SurfacePanel>
          <T3SurfacePanel tone="default" className="rounded-md bg-background/85 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">Updated</p>
            <p className="mt-1 truncate font-medium text-foreground">{updatedOn ?? "Unknown"}</p>
          </T3SurfacePanel>
        </div>

        {labels.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="text-[10px]">
                {label}
              </Badge>
            ))}
          </div>
        ) : null}

        {labels.length === 0 ? (
          <p className="mt-3 text-[11px] text-muted-foreground">No labels</p>
        ) : null}
      </T3SurfaceCardContent>
    </T3SurfaceCard>
  );
}
