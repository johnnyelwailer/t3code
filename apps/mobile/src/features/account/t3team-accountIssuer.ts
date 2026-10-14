import { BROKER_RESOURCE } from "@t3tools/shared/t3team-nexiBrokerClient";
import Constants from "expo-constants";

import { normalizeSecureUrl } from "../cloud/publicConfig";

/**
 * The account this app signs the user in to, in the shape of the pack seam's `defineAccount`
 * (`@t3team/pack-api`): an OAuth 2.0 public client described as data. The app owns the flows, the
 * stored grant and the UI; this config only says where the issuer is and what the app may ask for.
 *
 * Unlike the desktop server, a phone cannot listen on loopback, so the browser sign-in redirects to
 * the app's own scheme (`redirectUri`). It is null until that URI is registered on the issuer;
 * the device code is then the only way in.
 */
export interface MobileAccountDefinition {
  readonly id: string;
  readonly label: string;
  readonly issuer: {
    readonly clientId: string;
    readonly authorizationEndpoint: string;
    readonly tokenEndpoint: string;
    readonly deviceAuthorizationEndpoint: string | null;
  };
  readonly baseScopes: string;
  readonly resources: Readonly<Record<string, string>>;
  readonly signInResource: string;
  readonly redirectUri: string | null;
}

export interface ResolvedMobileAccount {
  readonly account: MobileAccountDefinition;
  /** True when the build supplied no tenant/client and the Nexplore pack's ids stand in. */
  readonly issuerIsDevDefault: boolean;
}

/**
 * Development fallback: the public tenant and `nx-nexi` app ids from the distribution's
 * `nexplore-global/account.ts`. Release builds receive them from the GHE `mobile.json` through
 * `T3CODE_NEXI_BROKER_TENANT` / `T3CODE_NEXI_BROKER_APP`.
 */
export const DEV_NEXPLORE_TENANT = "be4f2c2f-7478-413e-9569-aa6278d6f7f1";
export const DEV_NEXPLORE_CLIENT_ID = "9fff57c4-d8ab-4d4c-9267-c5528b7ae345";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AccountExtra =
  | {
      readonly account?: {
        readonly tenant?: unknown;
        readonly clientId?: unknown;
        readonly redirectUri?: unknown;
        readonly endpoints?: {
          readonly authorization?: unknown;
          readonly token?: unknown;
          readonly deviceAuthorization?: unknown;
        };
      };
    }
  | undefined;

const guidOrNull = (value: unknown) =>
  typeof value === "string" && GUID.test(value.trim()) ? value.trim().toLowerCase() : null;

/** An app-scheme redirect (`nexiwork://auth`), never an http(s) page another app could serve. */
export function normalizeAppRedirectUri(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const match = /^([a-z][a-z0-9+.-]*):\/\/\S+$/i.exec(value.trim());
  if (match === null || ["http", "https"].includes(match[1]!.toLowerCase())) return null;
  return value.trim();
}

export const entraEndpoint = (tenant: string, path: "authorize" | "token" | "devicecode") =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/${path}`;

export function nexploreAccount(input: {
  readonly tenant: string;
  readonly clientId: string;
  readonly redirectUri: string | null;
  readonly endpoints?: Partial<MobileAccountDefinition["issuer"]>;
}): MobileAccountDefinition {
  return {
    id: "nexplore",
    label: "Nexplore",
    issuer: {
      clientId: input.clientId,
      authorizationEndpoint:
        input.endpoints?.authorizationEndpoint ?? entraEndpoint(input.tenant, "authorize"),
      tokenEndpoint: input.endpoints?.tokenEndpoint ?? entraEndpoint(input.tenant, "token"),
      deviceAuthorizationEndpoint:
        input.endpoints?.deviceAuthorizationEndpoint ?? entraEndpoint(input.tenant, "devicecode"),
    },
    baseScopes: "openid profile offline_access",
    resources: { [BROKER_RESOURCE]: `api://${input.clientId}/relay.access` },
    signInResource: BROKER_RESOURCE,
    redirectUri: input.redirectUri,
  };
}

const definedEndpoints = (
  endpoints: NonNullable<NonNullable<AccountExtra>["account"]>["endpoints"],
): Partial<MobileAccountDefinition["issuer"]> => {
  const authorizationEndpoint = normalizeSecureUrl(endpoints?.authorization);
  const tokenEndpoint = normalizeSecureUrl(endpoints?.token);
  const deviceAuthorizationEndpoint = normalizeSecureUrl(endpoints?.deviceAuthorization);
  return {
    ...(authorizationEndpoint ? { authorizationEndpoint } : {}),
    ...(tokenEndpoint ? { tokenEndpoint } : {}),
    ...(deviceAuthorizationEndpoint ? { deviceAuthorizationEndpoint } : {}),
  };
};

/**
 * The account baked into `expoConfig.extra.account` by `app.config.ts`. Endpoints default to the
 * tenant's Entra ID v2 endpoints; explicit https endpoints override them (another issuer, a test
 * issuer). A build with no tenant/client falls back to the Nexplore pack's public ids.
 */
export function resolveMobileAccount(
  extra: AccountExtra = Constants.expoConfig?.extra,
): ResolvedMobileAccount {
  const tenant = guidOrNull(extra?.account?.tenant);
  const clientId = guidOrNull(extra?.account?.clientId);
  const configured = tenant !== null && clientId !== null;
  return {
    account: nexploreAccount({
      tenant: configured ? tenant : DEV_NEXPLORE_TENANT,
      clientId: configured ? clientId : DEV_NEXPLORE_CLIENT_ID,
      redirectUri: normalizeAppRedirectUri(extra?.account?.redirectUri),
      endpoints: definedEndpoints(extra?.account?.endpoints),
    }),
    issuerIsDevDefault: !configured,
  };
}
