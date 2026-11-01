import { useEffect, useState } from "react";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import {
  mapDiscoveredRecipesToQuickStarts,
  mergeSidecarRecipeQuickStarts,
} from "~/t3team/t3team-sidecarRecipeDiscoveryMapping";
import type { buildProjectRecipeDiscoveryRequest } from "~/t3team/t3team-sidecarRecipeRenderContext";
import { areQuickStartsEqual } from "~/t3team/t3team-sidecarRecipeQuickStartEquality";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

type DiscoveryRequest = ReturnType<typeof buildProjectRecipeDiscoveryRequest>;
type QuickStarts = ReadonlyArray<T3TeamSidecarRecipeQuickStart>;

/**
 * `pending` while the discovery for the current request is in flight. `settled` once it answered,
 * or when there is nothing to discover (no backend or workspace: the bundled list is final).
 * `failed` when it rejected; the list then holds the bundled fallback.
 */
export type RecipeDiscoveryStatus = "pending" | "settled" | "failed";

/**
 * The discovered quick starts for `discoveryRequest`, merged over `fallbackQuickStarts`, and
 * whether that discovery has finished. The status is keyed to the request it answered, so a new
 * request reads `pending` in the same render and a consumer never sees a stale `settled`.
 */
export function useRecipeDiscovery(input: {
  readonly backend: BackendApi | null;
  readonly discoveryRequest: DiscoveryRequest | null;
  readonly fallbackQuickStarts: QuickStarts;
  readonly limit: number | undefined;
}): { readonly quickStarts: QuickStarts; readonly status: RecipeDiscoveryStatus } {
  const { backend, discoveryRequest, fallbackQuickStarts, limit } = input;
  const [quickStarts, setQuickStarts] = useState<QuickStarts>(fallbackQuickStarts);
  const [outcome, setOutcome] = useState<{
    readonly request: DiscoveryRequest;
    readonly status: "settled" | "failed";
  } | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the list in step with an async discovery request, cancelled on change
  useEffect(() => {
    const setQuickStartsIfChanged = (next: QuickStarts) =>
      setQuickStarts((current) => (areQuickStartsEqual(current, next) ? current : next));

    setQuickStartsIfChanged(fallbackQuickStarts);
    if (!backend || !discoveryRequest) {
      return;
    }

    let cancelled = false;
    void backend.projectWorkspace
      .discoverRecipes(discoveryRequest)
      .then((response) => {
        if (cancelled) {
          return;
        }
        // Gate on what was DISCOVERED, not on `hasProjectLocalRecipes` — pack-shipped recipes are a
        // legitimate source that reports that flag false. Empty list still means bundled fallback.
        setQuickStartsIfChanged(
          response.recipes.length === 0
            ? fallbackQuickStarts
            : mergeSidecarRecipeQuickStarts(
                mapDiscoveredRecipesToQuickStarts(
                  response.recipes,
                  discoveryRequest.context.surface,
                  limit,
                  discoveryRequest.context,
                ),
                fallbackQuickStarts,
                limit,
              ),
        );
        setOutcome({ request: discoveryRequest, status: "settled" });
      })
      .catch(() => {
        if (!cancelled) {
          setQuickStartsIfChanged(fallbackQuickStarts);
          setOutcome({ request: discoveryRequest, status: "failed" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backend, discoveryRequest, fallbackQuickStarts, limit]);

  const status: RecipeDiscoveryStatus =
    !backend || !discoveryRequest
      ? "settled"
      : outcome?.request === discoveryRequest
        ? outcome.status
        : "pending";
  return { quickStarts, status };
}
