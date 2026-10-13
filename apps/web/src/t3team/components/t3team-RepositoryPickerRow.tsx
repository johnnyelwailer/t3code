import type { ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "~/lib/utils";

export type RepositoryPickerEntry = {
  readonly url: string;
  readonly name: string;
  readonly host: string;
  readonly description?: string;
  readonly isPrivate?: boolean;
};

/**
 * One repository as a selectable card: the whole card toggles the link, so there is no separate
 * Add/Remove target. Cards wrap in a grid so many repositories (and their sync state) fit at once.
 */
export function RepositoryPickerRow({
  entry,
  linked,
  showHost,
  onToggle,
  status,
}: {
  entry: RepositoryPickerEntry;
  linked: boolean;
  showHost: boolean;
  onToggle: (url: string) => void;
  /** Rendered at the foot of the card, e.g. its clone/sync state. */
  status?: ReactNode;
}) {
  const slash = entry.name.indexOf("/");
  const owner = slash < 0 ? "" : entry.name.slice(0, slash + 1);
  const repo = slash < 0 ? entry.name : entry.name.slice(slash + 1);
  return (
    <li className="min-w-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={linked}
        onClick={() => onToggle(entry.url)}
        className={cn(
          "group flex h-full w-full flex-col gap-1.5 rounded-lg border p-3 text-left text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring",
          linked
            ? "border-primary/60 bg-primary/5"
            : "border-border bg-background/40 hover:border-foreground/30 hover:bg-accent/40",
        )}
      >
        <span className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-sm border transition-colors",
              linked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background/40 text-transparent group-hover:border-foreground/40",
            )}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1 text-sm leading-snug break-words">
            <span className="text-muted-foreground">{owner}</span>
            <span className="font-medium">{repo}</span>
          </span>
          {entry.isPrivate ? (
            <Lock
              className="mt-0.5 size-3 shrink-0 text-muted-foreground/70"
              aria-label="Private"
            />
          ) : null}
        </span>
        {entry.description ? (
          <span className="line-clamp-2 pl-7 text-xs text-muted-foreground">
            {entry.description}
          </span>
        ) : null}
        {showHost || status ? (
          <span className="mt-auto flex items-center justify-between gap-2 pl-7 pt-0.5">
            <span className="min-w-0 flex-1">{status}</span>
            {showHost ? (
              <span className="shrink-0 text-2xs text-muted-foreground/80">{entry.host}</span>
            ) : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}
