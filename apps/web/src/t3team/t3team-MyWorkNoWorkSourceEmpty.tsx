import { Button } from "~/components/ui/button";

/**
 * My Work with no project bound to a work source. With `onConnect` it adds the one-line hint
 * that opens the add-a-Jira-project flow; first-time setup itself is the welcome wizard's job.
 */
export function T3TeamMyWorkNoWorkSourceEmpty({
  onConnect,
}: {
  readonly onConnect?: (() => void) | undefined;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
      <p className="max-w-sm text-center text-muted-foreground text-sm">
        No projects are connected to a work source yet. Connect one to see the items assigned to you
        here.
      </p>
      {onConnect ? (
        <Button size="sm" variant="outline" onClick={onConnect}>
          Connect a Jira project
        </Button>
      ) : null}
    </div>
  );
}
