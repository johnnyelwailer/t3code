import { createFileRoute } from "@tanstack/react-router";
import { T3TeamRouteSurface } from "~/t3team/t3team-route-surface";
import { parseT3TeamRouteSearch } from "~/t3team/t3team-routeState";

export const Route = createFileRoute("/t3team/projects/$projectId/threads/$threadId")({
  validateSearch: (search) => parseT3TeamRouteSearch(search),
  component: T3TeamRouteSurface,
});
