import { EllipsisIcon, SquarePenIcon } from "lucide-react";

export function ProjectSidebarTicketEntryActions({
  displayId,
  onCreateThread,
  onOpenMenu,
}: {
  displayId: string;
  onCreateThread: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-stretch opacity-0 transition-opacity duration-150 group-hover/ticket-card:pointer-events-auto group-hover/ticket-card:opacity-100 group-focus-within/ticket-card:pointer-events-auto group-focus-within/ticket-card:opacity-100">
      <div className="h-full w-8 bg-gradient-to-r from-transparent via-card/70 to-card" />
      <div className="flex h-full items-center gap-1 bg-card px-1.5">
        <button
          type="button"
          aria-label={`Create new thread for ${displayId}`}
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onCreateThread}
        >
          <SquarePenIcon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Issue actions for ${displayId}`}
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onOpenMenu}
        >
          <EllipsisIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
