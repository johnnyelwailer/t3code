import { useEffect } from "react";

/** Calm placeholder while the add-project page is left for a project the app already has. */
export function OpeningExistingProject() {
  return (
    <p data-testid="opening-existing-project" className="px-1 pt-8 text-sm text-muted-foreground">
      Opening…
    </p>
  );
}

/**
 * Deep-link leave: this page is only mounted to move the router off `/t3team/new?project=`
 * for a project the app already has. A click opens from its handler instead, so a standing
 * effect on `open` cannot retrigger if this tree stays mounted.
 */
export function OpenExistingProjectRedirect({
  projectId,
  open,
}: {
  projectId: string;
  open: (projectId: string) => void;
}) {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the router in step with a deep link to an already-added project; one navigation on mount, then this page unmounts
  useEffect(
    () => {
      open(projectId);
    },
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- a dep on open would restore the standing-effect loop this leave exists to prevent
    [],
  );

  return <OpeningExistingProject />;
}
