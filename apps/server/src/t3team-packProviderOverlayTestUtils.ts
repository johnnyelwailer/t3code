import type { ProviderInstanceConfigMap } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { getPackProviderOverlay, setPackProviderOverlay } from "./t3team-pack-providerOverlay.ts";

export const withPackProviderOverlay = (configMap: ProviderInstanceConfigMap) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const previous = getPackProviderOverlay();
      setPackProviderOverlay({ configMap, driverDefinitions: new Map() });
      return previous;
    }),
    (previous) =>
      Effect.sync(() =>
        setPackProviderOverlay({ configMap: previous, driverDefinitions: new Map() }),
      ),
  );
