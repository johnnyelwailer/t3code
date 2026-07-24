import { EllipsisVertical } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/t3team/components/ui/t3team-menu";
import type { T3TeamSidecarMenuEntry } from "~/t3team/t3team-sidecarSectionMenuActions";

export function T3TeamSidecarMenuKebabTrigger({
  triggerId,
  label,
  className,
}: {
  readonly triggerId: string;
  readonly label: string;
  readonly className?: string | undefined;
}) {
  return (
    <MenuTrigger
      id={triggerId}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[popup-open]:opacity-100",
        className,
      )}
    >
      <EllipsisVertical className="size-3.5" />
    </MenuTrigger>
  );
}

export function T3TeamSidecarMenuContent({
  entries,
}: {
  readonly entries: ReadonlyArray<T3TeamSidecarMenuEntry>;
}) {
  return (
    <MenuPopup align="end" className="min-w-40">
      {entries.map((entry) =>
        entry.kind === "separator" ? (
          <MenuSeparator key={entry.id} />
        ) : (
          <MenuItem
            key={entry.id}
            disabled={entry.disabled}
            onClick={entry.onSelect}
            {...(entry.variant ? { variant: entry.variant } : {})}
          >
            {entry.label}
          </MenuItem>
        ),
      )}
    </MenuPopup>
  );
}

export function T3TeamSidecarSectionItemMenu({
  entries,
  label,
  children,
}: {
  readonly entries: ReadonlyArray<T3TeamSidecarMenuEntry>;
  readonly label: string;
  readonly children: ReactNode;
}) {
  const triggerId = useId();
  const [open, setOpen] = useState(false);

  if (entries.length === 0) {
    return children;
  }

  return (
    <Menu open={open} onOpenChange={setOpen} triggerId={triggerId}>
      <div
        className="group/sidecar-item relative"
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
        <T3TeamSidecarMenuKebabTrigger
          triggerId={triggerId}
          label={label}
          className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover/sidecar-item:opacity-100 group-focus-within/sidecar-item:opacity-100"
        />
      </div>
      <T3TeamSidecarMenuContent entries={entries} />
    </Menu>
  );
}
