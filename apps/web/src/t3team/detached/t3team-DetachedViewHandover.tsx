/**
 * The detached page of an undocked view (`@t3tools/shared/t3team-detachedView`): it marks the
 * window as undocked and hands it to the route it was opened for, replacing itself in history
 * so Back never returns to it.
 */
import { DETACHED_VIEW_PATH_PARAM, detachedViewRoute } from "@t3tools/shared/t3team-detachedView";
import { useRouter } from "@tanstack/react-router";
import { useLayoutEffect } from "react";

import { StandalonePage, StandalonePageHeader } from "~/components/ui/standalone-page";

import type { DetachedSurfaceViewProps } from "./t3team-detachedSurfaceKinds";
import { markUndockedWindow } from "./t3team-undockedWindow";

export function DetachedViewHandover({ params }: DetachedSurfaceViewProps) {
  const router = useRouter();
  const route = detachedViewRoute(params[DETACHED_VIEW_PATH_PARAM]);
  useLayoutEffect(() => {
    if (route === null) return;
    markUndockedWindow();
    router.history.replace(route);
  }, [route, router]);

  if (route !== null) return null;
  return (
    <StandalonePage tone="error">
      <StandalonePageHeader
        eyebrow="Window"
        title="This window does not name a view"
        description="Close it and open the view in a new window again from the app."
      />
    </StandalonePage>
  );
}
