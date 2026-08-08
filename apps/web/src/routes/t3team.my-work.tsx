import { createFileRoute } from "@tanstack/react-router";
import { T3TeamRouteSurface } from "~/t3team/t3team-route-surface";
import { parseT3TeamRouteSearch } from "~/t3team/t3team-routeState";

export const Route = createFileRoute("/t3team/my-work")({
  validateSearch: (search) => parseT3TeamRouteSearch(search),
  component: T3TeamRouteSurface,
});
