import { createFileRoute } from "@tanstack/react-router";
import { T3workRouteSurface } from "~/t3work/t3work-route-surface";
import { parseT3workRouteSearch } from "~/t3work/t3work-routeState";

export const Route = createFileRoute("/t3work/projects/$projectId/recipes")({
  validateSearch: (search) => parseT3workRouteSearch(search),
  component: T3workRouteSurface,
});
