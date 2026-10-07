import { createFileRoute, useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { DetachedSurfaceRouteView } from "~/t3team/detached/t3team-DetachedSurfaceRouteView";

/**
 * A detached surface (`@t3tools/shared/t3team-detachedSurface`). A top-level route, outside the
 * Team shell's layout: the root renders this page bare, in a window or tab of its own.
 *
 * The search is read as the raw query string rather than declared with `validateSearch`. The
 * kinds own their params, so the route's search would be an open string record — and an index
 * signature in one route's search widens the search every untargeted `navigate` reducer in the
 * app sees. Raw reading also keeps values the strings they were written as (the router would
 * turn `number=12` into a number).
 */
export const Route = createFileRoute("/t3team-detached/$kind")({
  component: DetachedSurfaceRoute,
});

function DetachedSurfaceRoute() {
  const { kind } = Route.useParams();
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const router = useRouter();
  const params = useMemo(
    () => Object.fromEntries(new URLSearchParams(searchStr)) as Readonly<Record<string, string>>,
    [searchStr],
  );
  const onParamsChange = useCallback(
    (patch: Readonly<Record<string, string | undefined>>) => {
      const location = router.state.location;
      const current = new URLSearchParams(location.searchStr);
      const next = new URLSearchParams(current);
      for (const [name, value] of Object.entries(patch)) {
        if (value === undefined) next.delete(name);
        else next.set(name, value);
      }
      // Compared in one encoding: the router's own serialization of the same search can differ
      // (spaces, slashes), and a mismatch there is not a change.
      const query = next.toString();
      if (query === current.toString()) return;
      router.history.replace(`${location.pathname}${query === "" ? "" : `?${query}`}`);
    },
    [router],
  );
  return <DetachedSurfaceRouteView kind={kind} params={params} onParamsChange={onParamsChange} />;
}
