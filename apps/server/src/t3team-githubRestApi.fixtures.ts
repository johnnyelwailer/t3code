/**
 * A `GitHubApi` double for the `t3team-github-*` read tests. It answers `rest` from a handler and
 * records every request with the reserve setting it was made under, so a test can prove a read
 * went through `GitHubApi` (rather than a subprocess) and under the right priority.
 */

import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";

export interface RecordedRestCall {
  readonly host: string;
  readonly operation: string;
  readonly path: string;
  /** Whether the call could spend the quota reserve: `SourceControlRateLimit.Interactive` at call time. */
  readonly allowReserve: boolean;
}

type Handler = (
  call: RecordedRestCall,
) => Effect.Effect<GitHubApi.GitHubRestResponse, GitHubApi.GitHubApiError>;

export const restOk = (
  body: unknown,
  headers: Readonly<Record<string, string | undefined>> = {},
): Effect.Effect<GitHubApi.GitHubRestResponse> =>
  Effect.succeed({
    status: 200,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
    truncated: false,
    invalidUtf8: false,
  });

export const rateLimited = (host: string, retryAt?: number) =>
  Effect.fail(
    new GitHubApi.GitHubApiRateLimitError({
      host,
      operation: "test",
      ...(retryAt === undefined ? {} : { retryAt }),
    }),
  );

export function makeFakeGitHubApi(
  handler: Handler,
  credential?: GitHubApi.GitHubApi["Service"]["credential"],
) {
  const calls: Array<RecordedRestCall> = [];
  const credentialHosts: Array<string> = [];
  const api = GitHubApi.GitHubApi.of({
    rest: (input) =>
      Effect.gen(function* () {
        const call = {
          host: input.host,
          operation: input.operation,
          path: input.path,
          allowReserve: input.allowReserve ?? (yield* SourceControlRateLimit.Interactive),
        } satisfies RecordedRestCall;
        calls.push(call);
        return yield* handler(call);
      }),
    graphql: () => Effect.die("graphql is not used by the t3team-github-* reads"),
    credential: (host) => {
      credentialHosts.push(host);
      return (
        credential?.(host) ??
        Effect.succeed({ token: Redacted.make("test-token"), fingerprint: "test-fingerprint" })
      );
    },
  });
  return { api, calls, credentialHosts };
}
