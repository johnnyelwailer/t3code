import { exchangeCode, listAccessibleResources } from "@t3tools/integrations-atlassian";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import {
  errorResponse,
  okJson,
  readJsonBody,
  tryAtlassianPromise,
} from "./t3work-atlassian-http.ts";

type OAuthExchangeInput = {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
};

function requiredAtlassianOAuthEnv(): { clientId: string; clientSecret: string } {
  const clientId =
    process.env.T3WORK_ATLASSIAN_CLIENT_ID?.trim() ??
    process.env.VITE_ATLASSIAN_CLIENT_ID?.trim() ??
    "";
  const clientSecret = process.env.T3WORK_ATLASSIAN_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Atlassian OAuth is not configured. Set T3WORK_ATLASSIAN_CLIENT_ID and T3WORK_ATLASSIAN_CLIENT_SECRET on the server.",
    );
  }
  return { clientId, clientSecret };
}

export const t3workAtlassianOAuthExchangeRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/oauth/exchange",
  Effect.gen(function* () {
    const input = yield* readJsonBody<OAuthExchangeInput>();
    const config = requiredAtlassianOAuthEnv();
    const token = yield* tryAtlassianPromise(
      () =>
        exchangeCode({ ...config, redirectUri: input.redirectUri }, input.code, input.codeVerifier),
      "Failed to exchange Atlassian OAuth code.",
    );
    const sites = yield* tryAtlassianPromise(
      () => listAccessibleResources(token.accessToken),
      "Failed to load Atlassian sites.",
    );
    return okJson({ token, sites });
  }).pipe(Effect.catch(errorResponse)),
);
