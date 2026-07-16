/**
 * Atlassian connect/OAuth input+result types for the web backend API,
 * split from t3work-atlassianBackendTypes.ts to keep it under the
 * additive-guard LOC cap.
 */
import type {
  AtlassianAccessibleResource,
  TokenExchangeResult,
} from "@t3tools/integrations-atlassian";

export type AtlassianBasicConnectInput = {
  readonly siteUrl: string;
  readonly email: string;
  readonly apiToken: string;
};

export type AtlassianOAuthConnectInput = {
  readonly sites: ReadonlyArray<AtlassianAccessibleResource>;
  readonly token: TokenExchangeResult;
};

export type AtlassianOAuthExchangeInput = {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
};

export type AtlassianOAuthExchangeResult = {
  readonly token: TokenExchangeResult;
  readonly sites: ReadonlyArray<AtlassianAccessibleResource>;
};
