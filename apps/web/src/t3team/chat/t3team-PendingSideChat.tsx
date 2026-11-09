import { Spinner } from "~/components/ui/spinner";

/** A side chat whose tab is open while upstream still forks the thread and sends the question. */
export function PendingSideChat(props: { readonly prompt: string | null }) {
  return (
    <div data-side-chat-pane className="flex h-full min-h-0 flex-col" aria-busy="true">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">Side chat</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {props.prompt === null ? null : (
          <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap">
            {props.prompt}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Starting the side chat…
        </div>
      </div>
    </div>
  );
}
