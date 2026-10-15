import Constants from "expo-constants";

import { normalizeSecureUrl } from "../cloud/publicConfig";

/**
 * Development fallback for the Nexplore AI Gateway, copied from the `nexplore-global` pack's
 * `pi-config.ts` (`BASE_URL`). Release builds receive the real value from the GHE distribution
 * through `T3CODE_NEXI_PROVIDER_ENDPOINT`; this default only keeps local builds coherent.
 */
export const DEV_NEXI_PROVIDER_ENDPOINT = "https://chat.nexplore.dev/v1";

export const NEXI_DISTRIBUTION_PACK_ID = "nexplore-global";

export interface NexiDistributionConfig {
  readonly packId: string;
  readonly provider: {
    readonly endpoint: string;
    readonly endpointIsDevDefault: boolean;
  };
  readonly broker: {
    readonly url: string | null;
  };
}

type DistributionExtra =
  | {
      readonly distribution?: {
        readonly providerEndpoint?: unknown;
        readonly brokerUrl?: unknown;
      };
    }
  | undefined;

/**
 * Distribution values baked into `expoConfig.extra.distribution` by `app.config.ts`. The provider
 * itself runs on the connected server; the app reads the endpoint to describe which gateway the
 * distribution targets and the broker URL to reach Nexi cloud sessions.
 */
export function resolveNexiDistributionConfig(
  extra: DistributionExtra = Constants.expoConfig?.extra,
): NexiDistributionConfig {
  const endpoint = normalizeSecureUrl(extra?.distribution?.providerEndpoint);
  return {
    packId: NEXI_DISTRIBUTION_PACK_ID,
    provider: {
      endpoint: endpoint ?? DEV_NEXI_PROVIDER_ENDPOINT,
      endpointIsDevDefault: endpoint === null,
    },
    broker: {
      url: normalizeSecureUrl(extra?.distribution?.brokerUrl),
    },
  };
}
