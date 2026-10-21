/**
 * t3team: the fork's `GitHubApi` service, kept as a thin facade after upstream split the GitHub
 * transport into `GitHubRest` (REST), `GitHubRequestPolicy` (credential, slots, quota, pause) and
 * the generated `effect/graphql` client (#19224).
 *
 * Fork code (cloud sessions, inbox, linked PRs, digests, …) still sends raw REST paths and raw
 * GraphQL documents. `rest` goes straight to the shared `GitHubRest` (read coalescer and search
 * quota included); `graphql` sends a raw document through the same `GitHubRequestPolicy`, so
 * REST, raw GraphQL and upstream's generated GraphQL share one set of slots and one quota view.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, type HttpClientResponse } from "effect/http";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";

import { collectUint8StreamText } from "@t3tools/provider-core/server/collectStreamText";
import * as GitHubRequestPolicy from "./GitHubRequestPolicy.ts";
import * as GitHubRest from "./GitHubRest.ts";
import {
  isGraphQlQuery,
  isIdempotentRestMethod,
  retryTransientRead,
} from "./t3team-githubTransientRetry.ts";

export {
  GitHubApiAuthenticationError,
  GitHubApiNotFoundError,
  GitHubApiRateLimitError,
  GitHubApiRequestError,
  GitHubApiResponseError,
  PinnedGitHubCredential,
  gitHubApiUrls,
} from "./GitHubRequestPolicy.ts";
export type GitHubApiError = GitHubRequestPolicy.GitHubApiError;
export type GitHubRestResponse = GitHubRest.GitHubRestResponse;
export type GitHubRestInput = GitHubRest.GitHubRestInput;

const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/** GraphQL documents longer than this are cut in traces; the hash still identifies them. */
const TRACED_QUERY_MAX_CHARS = 4_000;

export interface GitHubGraphQlInput {
  readonly host: string;
  readonly operation: string;
  readonly query: string;
  readonly variables?: Readonly<Record<string, unknown>>;
  readonly allowReserve?: boolean;
  readonly maxResponseBytes?: number;
  /**
   * An answer whose only errors are `NOT_FOUND` is returned with its `data` instead of failing.
   * For aliased documents, where one repository gone or out of reach must not hide the others';
   * the caller reads each alias for null.
   */
  readonly allowPartialNotFound?: boolean;
  /**
   * An answer whose only errors are `RESOURCE_LIMITS_EXCEEDED` is returned with its `data` instead
   * of failing. GitHub answers a heavy field (a pull request's check rollup) with that error and
   * null at its path while every other field of every row is still there, so a listing reads the
   * rows it has and treats the field it could not compute as unknown.
   */
  readonly allowPartialResourceLimits?: boolean;
}

export class GitHubApi extends Context.Service<
  GitHubApi,
  {
    /** The raw JSON body of a successful GraphQL answer. */
    readonly graphql: (input: GitHubGraphQlInput) => Effect.Effect<string, GitHubApiError>;
    readonly rest: (input: GitHubRestInput) => Effect.Effect<GitHubRestResponse, GitHubApiError>;
    /** The credential a request to `host` would carry right now. */
    readonly credential: (
      host: string,
    ) => Effect.Effect<
      { readonly token: Redacted.Redacted<string>; readonly fingerprint: string },
      GitHubApiError
    >;
  }
>()("@t3tools/source-control-github/server/t3team-GitHubApi/GitHubApi") {}

/** A stable short id for a GraphQL document, so traces group by query without its text. */
function queryHash(query: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < query.length; index++) {
    hash ^= query.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const decodeGraphQlErrors = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      errors: Schema.NonEmptyArray(
        Schema.Struct({
          type: Schema.optional(Schema.String),
          message: Schema.optional(Schema.String),
        }),
      ),
    }),
  ),
);

/**
 * GitHub reports a failed GraphQL document with HTTP 200 and an `errors` list, so the body is read
 * for its error types as well as its status. Callers rely on that to fall back to narrower reads.
 */
function classifyGraphQl(input: {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string;
  readonly allowPartialNotFound: boolean;
  readonly allowPartialResourceLimits: boolean;
}): GitHubRequestPolicy.GitHubAnswer<string> {
  const { status, headers, body } = input;
  const meta = { status, headers };
  const errors = Option.getOrUndefined(decodeGraphQlErrors(body))?.errors;
  if (
    GitHubRequestPolicy.isRateLimited({
      status,
      headers,
      body,
      ...(errors === undefined ? {} : { graphqlErrors: errors }),
    })
  ) {
    return { _tag: "RateLimited", ...meta };
  }
  if (status === 401) return { _tag: "Unauthorized", ...meta };
  const notFoundOnly = errors !== undefined && errors.every((error) => error.type === "NOT_FOUND");
  const tolerated = [
    ...(input.allowPartialNotFound ? ["NOT_FOUND"] : []),
    ...(input.allowPartialResourceLimits ? ["RESOURCE_LIMITS_EXCEEDED"] : []),
  ];
  if (
    tolerated.length > 0 &&
    status >= 200 &&
    status < 300 &&
    errors !== undefined &&
    errors.every((error) => error.type !== undefined && tolerated.includes(error.type))
  ) {
    return { _tag: "Ok", value: body, ...meta };
  }
  if (status === 404 || notFoundOnly) return { _tag: "NotFound", ...meta };
  if (errors !== undefined) {
    return {
      _tag: "Failed",
      messages: errors.flatMap((error) => (error.message === undefined ? [] : [error.message])),
      ...meta,
    };
  }
  if (status >= 200 && status < 300) return { _tag: "Ok", value: body, ...meta };
  return { _tag: "Failed", ...meta };
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const policy = yield* GitHubRequestPolicy.GitHubRequestPolicy;
  const restTransport = yield* GitHubRest.GitHubRest;

  const graphql: GitHubApi["Service"]["graphql"] = Effect.fn("GitHubApi.graphql")(
    function* (input) {
      const host = GitHubRequestPolicy.normalizeHost(input.host);
      const allowReserve = input.allowReserve ?? (yield* SourceControlRateLimit.Interactive);
      const maxBytes = input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
      // The document, never its variables: user text (bodies, search terms) travels as variables.
      yield* Effect.annotateCurrentSpan({
        "github.kind": "graphql",
        "github.graphql.query_hash": queryHash(input.query),
        "github.graphql.query":
          input.query.length > TRACED_QUERY_MAX_CHARS
            ? `${input.query.slice(0, TRACED_QUERY_MAX_CHARS)}…`
            : input.query,
      });
      const request = HttpClientRequest.post(GitHubRequestPolicy.gitHubApiUrls(host).graphql).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.bodyJsonUnsafe({ query: input.query, variables: input.variables ?? {} }),
      );
      return yield* retryTransientRead(
        policy.request(
          { host, operation: input.operation, resource: "graphql", allowReserve },
          (headers) =>
            Effect.gen(function* () {
              const response: HttpClientResponse.HttpClientResponse = yield* httpClient
                .execute(request.pipe(HttpClientRequest.setHeaders(headers)))
                .pipe(Effect.provideService(HttpClient.TracerDisabledWhen, () => true));
              const collected = yield* collectUint8StreamText({
                stream: response.stream,
                maxBytes,
              }).pipe(
                Effect.catchIf(
                  (error) => error.reason._tag === "EmptyBodyError",
                  () => Effect.succeed({ text: "", truncated: false, invalidUtf8: false }),
                ),
              );
              // A body cut at the byte cap hides any `errors` past the cut and cannot be decoded.
              if (collected.truncated) {
                return {
                  _tag: "Failed" as const,
                  status: response.status,
                  headers: response.headers,
                };
              }
              return classifyGraphQl({
                status: response.status,
                headers: response.headers,
                body: collected.text,
                allowPartialNotFound: input.allowPartialNotFound === true,
                allowPartialResourceLimits: input.allowPartialResourceLimits === true,
              });
            }).pipe(
              Effect.mapError(
                (cause) =>
                  new GitHubRequestPolicy.GitHubApiRequestError({
                    host,
                    operation: input.operation,
                    cause,
                  }),
              ),
            ),
        ),
        isGraphQlQuery(input.query),
      );
    },
  );

  return GitHubApi.of({
    graphql,
    rest: (input) =>
      retryTransientRead(restTransport.rest(input), isIdempotentRestMethod(input.method)),
    credential: restTransport.credential,
  });
});

/** The facade over a `GitHubRest` (and its request policy) provided from outside. */
export const layer = Layer.effect(GitHubApi, make);

/**
 * The facade with upstream's shared transport (`GitHubRest.layerWithDependencies`: REST, request
 * policy, credentials, quota, pause). The same layer reference the built-in drivers use, so one
 * application build shares one instance of each.
 */
export const layerWithDependencies = layer.pipe(
  Layer.provideMerge(GitHubRest.layerWithDependencies),
);
