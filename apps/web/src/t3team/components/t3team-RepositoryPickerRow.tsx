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

/** One repository: the whole row toggles the link, so there is no separate Add/Remove target. */
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
  /** Rendered under the row, aligned with the repository name. */
  status?: ReactNode;
}) {
  const slash = entry.name.indexOf("/");
  const owner = slash < 0 ? "" : entry.name.slice(0, slash + 1);
  const repo = slash < 0 ? entry.name : entry.name.slice(slash + 1);
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={linked}
        onClick={() => onToggle(entry.url)}
        className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          className={cn(
            "flex size-[18px] shrink-0 items-center justify-center rounded-sm border transition-colors",
            linked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background/40 text-transparent group-hover:border-foreground/40",
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 text-sm">
            <span className="text-muted-foreground">{owner}</span>
            <span className="font-medium">{repo}</span>
          </span>
          {entry.isPrivate ? (
            <Lock className="size-3 shrink-0 self-center text-muted-foreground/70" />
          ) : null}
          {entry.description ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {entry.description}
            </span>
          ) : null}
        </span>
        {showHost ? (
          <span className="shrink-0 text-2xs text-muted-foreground/80 max-sm:hidden">
            {entry.host}
          </span>
        ) : null}
      </button>
      {status ? <div className="pr-2.5 pb-1 pl-10">{status}</div> : null}
    </li>
  );
}
