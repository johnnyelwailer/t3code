import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { badRequestJson, errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import {
  ATLASSIAN_OAUTH_BEGIN_ROUTE,
  beginAtlassianOAuthFlow,
  completeAtlassianOAuthFlow,
  resolveAtlassianOAuthAuthorizeUrl,
  resolveAtlassianOAuthFlowStatus,
} from "./t3team-atlassian-oauth-flow.ts";

type BeginInput = { readonly redirectUri?: string };
type CompleteInput = { readonly state?: string; readonly code?: string };

/**
 * Absolute form of the shareable link, derived from the request's own `Host`.
 *
 * Returned alongside `beginPath` rather than instead of it: in dev the app reaches `/api` through
 * the Vite proxy, so the host the server sees is its own port — reachable from another browser on
 * the same machine, but not from a phone. A caller that knows the origin the user actually loaded
 * the app on should prefer `origin + beginPath`.
 */
function absoluteBeginUrl(request: HttpServerRequest.HttpServerRequest, beginPath: string): string {
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = (forwardedHost ?? request.headers.host ?? "").split(",")[0]?.trim();
  if (!host) return beginPath;
  // Plain http unless something in front says otherwise: this server terminates no TLS itself.
  const scheme = request.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || "http";
  return `${scheme}://${host}${beginPath}`;
}

const t3teamAtlassianOAuthBeginRouteLayer = HttpRouter.add(
  "POST",
  ATLASSIAN_OAUTH_BEGIN_ROUTE,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const input = yield* readJsonBody<BeginInput>();
    const begun = yield* beginAtlassianOAuthFlow({ redirectUri: input.redirectUri ?? "" });
    return okJson({ ...begun, beginUrl: absoluteBeginUrl(request, begun.beginPath) });
  }).pipe(Effect.catch(errorResponse)),
);

/**
 * The shareable "view URL": a bare GET that any browser can follow with no cookie, token or prior
 * session, because everything it needs is already held server-side under `:state`.
 *
 * `no-store` matters more than it looks — a cached 302 in a shared or corporate proxy would keep
 * pointing a later, unrelated visitor at this user's authorize URL.
 */
const t3teamAtlassianOAuthBeginRedirectRouteLayer = HttpRouter.add(
  "GET",
  `${ATLASSIAN_OAUTH_BEGIN_ROUTE}/:state`,
  Effect.gen(function* () {
    const params = yield* HttpRouter.params;
    const authorizeUrl = yield* resolveAtlassianOAuthAuthorizeUrl(params.state ?? "");
    if (!authorizeUrl) {
      return HttpServerResponse.text(
        "This Atlassian sign-in link has expired or was already used. Start again from T3 Code.",
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    return HttpServerResponse.redirect(authorizeUrl, {
      status: 302,
      headers: { "cache-control": "no-store" },
    });
  }),
);

/**
 * Where the callback page hands the code back. Unauthenticated by design: it runs in whatever
 * browser finished sign-in, which has no pairing with this server. It carries no secret — the
 * verifier and client secret never leave the process — and an unknown `state` is reported as a
 * flow outcome rather than an error, so the callback page can tell "expired" from "broken".
 */
const t3teamAtlassianOAuthCompleteRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/oauth/complete",
  Effect.gen(function* () {
    const input = yield* readJsonBody<CompleteInput>();
    const state = input.state?.trim() ?? "";
    const code = input.code?.trim() ?? "";
    if (!state || !code) {
      return badRequestJson("Atlassian sign-in callback is missing its state or code.");
    }
    return okJson(yield* completeAtlassianOAuthFlow({ state, code }));
  }).pipe(Effect.catch(errorResponse)),
);

/**
 * Lets a tab that has no way to hear a `postMessage` — sign-in finished in a different browser
 * entirely, so there was never a shared opener or same-origin broadcast — ask directly instead of
 * waiting forever. Unauthenticated for the same reason `complete` is: `state` is already the whole
 * capability, and this returns strictly less than that route does.
 */
const t3teamAtlassianOAuthStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/t3team/atlassian/oauth/status/:state",
  Effect.gen(function* () {
    const params = yield* HttpRouter.params;
    const status = yield* resolveAtlassianOAuthFlowStatus(params.state ?? "");
    return okJson({ status });
  }),
);

export const t3teamAtlassianOAuthFlowRouteLayer = Layer.mergeAll(
  t3teamAtlassianOAuthBeginRouteLayer,
  t3teamAtlassianOAuthBeginRedirectRouteLayer,
  t3teamAtlassianOAuthCompleteRouteLayer,
  t3teamAtlassianOAuthStatusRouteLayer,
);
