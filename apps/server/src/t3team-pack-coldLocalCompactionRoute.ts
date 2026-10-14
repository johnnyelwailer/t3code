/**
 * Pack-registered cold-cache local compaction routes (`defineColdLocalCompactionRoute`,
 * capability `cold-local-compaction:v1`). One route per driver; with none registered every
 * compaction stays on the driver's native `/compact`.
 *
 * @module t3team-pack-coldLocalCompactionRoute
 */
import type { ColdLocalCompactionRouteDefinition } from "@t3team/pack-api";
import { activateWorkspacePack } from "@t3team/packs";

import { inertPackActivationContext } from "./t3team-pack-activationContext.ts";
import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";

const CAPABILITY = "cold-local-compaction:v1";

const routesByDriver = new Map<string, ColdLocalCompactionRouteDefinition>();

const isNonNegativeNumber = (value: number): boolean => Number.isFinite(value) && value >= 0;

function assertValidColdLocalCompactionRoute(route: ColdLocalCompactionRouteDefinition): void {
  const named = [route.driver, route.localProviderInstance, route.localModel];
  if (named.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(
      "Cold local compaction route needs a driver, localProviderInstance and localModel",
    );
  }
  if (!isNonNegativeNumber(route.ttlMs) || !isNonNegativeNumber(route.minUsedTokens)) {
    throw new Error("Cold local compaction route ttlMs and minUsedTokens must be non-negative");
  }
}

/** Replaces the registered routes; boot-only, in memory. */
export function setPackColdLocalCompactionRoutes(
  routes: ReadonlyArray<ColdLocalCompactionRouteDefinition>,
): void {
  routesByDriver.clear();
  for (const route of routes) {
    assertValidColdLocalCompactionRoute(route);
    if (routesByDriver.has(route.driver)) {
      throw new Error(`Multiple cold local compaction routes for driver ${route.driver}`);
    }
    routesByDriver.set(route.driver, route);
  }
}

export const getPackColdLocalCompactionRoute = (
  driver: string,
): ColdLocalCompactionRouteDefinition | undefined => routesByDriver.get(driver);

/** Collects every route the runtime packs register; the caller installs them with the setter. */
export const loadPackColdLocalCompactionRoutes = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<ReadonlyArray<ColdLocalCompactionRouteDefinition>> => {
  const routes: Array<ColdLocalCompactionRouteDefinition> = [];
  for (const pack of diagnostic.resolution?.packs ?? []) {
    if (!pack.manifest.entrypoints?.activate) continue;
    await activateWorkspacePack(pack, {
      ...inertPackActivationContext,
      defineColdLocalCompactionRoute: (definition) => {
        if (!pack.manifest.capabilities.includes(CAPABILITY)) {
          throw new Error(
            `Pack ${pack.manifest.id} defines a cold local compaction route without ${CAPABILITY}`,
          );
        }
        assertValidColdLocalCompactionRoute(definition);
        routes.push(definition);
      },
    });
  }
  return routes;
};
