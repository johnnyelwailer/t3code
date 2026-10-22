import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { HttpClient, HttpClientResponse, type HttpClientRequest } from "effect/http";

import * as GitHubApi from "./t3team-GitHubApi.ts";
import * as GitHubRest from "./GitHubRest.ts";
import * as GitHubCredentials from "./GitHubCredentials.ts";
import * as GitHubQuota from "./GitHubQuota.ts";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";

export const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

/**
 * The real `GitHubApi` over a fake HTTP client: what a test needs to count the requests that
 * actually leave the process, with the real quota, pause and read coalescer in between.
 */
export function makeGitHubApiHarness(
  respond: (request: HttpClientRequest.HttpClientRequest) => Response | Promise<Response>,
) {
  const requests: Array<HttpClientRequest.HttpClientRequest> = [];
  const credentials = Layer.succeed(
    GitHubCredentials.GitHubCredentials,
    GitHubCredentials.GitHubCredentials.of({
      get: (host) =>
        Effect.succeed({
          host,
          token: Redacted.make("token"),
          source: "gh" as const,
          fingerprint: `${host}:token`,
        }),
      invalidate: () => Effect.void,
    }),
  );
  const http = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      requests.push(request);
      return Effect.promise(async () => respond(request)).pipe(
        Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
      );
    }),
  );
  const layer = GitHubApi.layer.pipe(
    Layer.provideMerge(GitHubRest.layer),
    Layer.provideMerge(Layer.mergeAll(credentials, http)),
    Layer.provideMerge(GitHubQuota.layer),
    Layer.provideMerge(SourceControlRateLimit.layer),
  );
  const sent = (pathPart: string) =>
    requests.filter((request) => request.url.includes(pathPart)).length;
  return { layer, requests, sent };
}
