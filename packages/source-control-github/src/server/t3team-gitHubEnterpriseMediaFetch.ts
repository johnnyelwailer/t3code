import type { SourceControlMediaRequest } from "@t3tools/source-control-core/server/driver";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import * as EnterpriseMedia from "../shared/t3team-gitHubEnterpriseMedia.ts";

import * as GitHubMediaFetch from "./gitHubMediaFetch.ts";
import * as MediaPlan from "./t3team-gitHubEnterpriseMediaPlan.ts";

const MAX_REDIRECTS = 3;
const MANUAL_REDIRECT: RequestInit = { redirect: "manual" };

/**
 * Fork graft for the GitHub driver's `fetchMedia`: media on an enterprise host is fetched here,
 * everything else by upstream's `GitHubMediaFetch`, which stays untouched.
 */
const makeWith = Effect.fn("GitHubEnterpriseMediaFetch.make")(function* (
  isEnterprise: (host: string) => boolean,
) {
  const fetchGitHubMedia = yield* GitHubMediaFetch.make;
  const plan = yield* MediaPlan.make(isEnterprise);
  const httpClient = HttpClient.withScope(yield* HttpClient.HttpClient);

  return Effect.fn("GitHubEnterpriseMediaFetch.fetchMedia")(function* (
    request: SourceControlMediaRequest,
  ) {
    const planned = yield* plan(request.url);
    if (planned === undefined) return yield* fetchGitHubMedia(request);
    if (planned === null) return null;
    let target = planned.url;
    for (let hop = 0; ; hop += 1) {
      const authorization =
        planned.bearer !== null && planned.isCredentialedHost(target)
          ? `Bearer ${Redacted.value(planned.bearer)}`
          : null;
      const response = yield* httpClient
        .execute(
          HttpClientRequest.get(target).pipe(
            HttpClientRequest.setHeaders({
              ...request.headers,
              "accept-encoding": "identity",
              ...(authorization === null ? {} : { authorization }),
            }),
          ),
        )
        .pipe(
          Effect.provideService(FetchHttpClient.RequestInit, MANUAL_REDIRECT),
          // A signed URL's query string is a bearer capability; keep it out of tracing spans.
          Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
        );
      const location = response.headers.location;
      if (response.status < 300 || response.status >= 400) return response;
      if (!location || hop >= MAX_REDIRECTS) return null;
      const next = URL.parse(location, target);
      if (next?.protocol !== "https:" || !planned.mayRedirectTo(next)) return null;
      target = next.href;
    }
  });
});

export const make = makeWith(EnterpriseMedia.isGitHubEnterpriseMediaHost);
