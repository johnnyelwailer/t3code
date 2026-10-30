import * as Clock from "effect/Clock";
import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { PositiveInt, type PullRequestChecks } from "@t3tools/contracts";

import * as GitHubRest from "./GitHubRest.ts";
import * as GitHubRequestPolicy from "./GitHubRequestPolicy.ts";
import { nextPagePath } from "./t3team-githubLinkPaging.ts";
import type { GitHubPullRequestDetail } from "./gitHubPullRequestJson.ts";
import type { GitHubPullRequestApiError } from "./GitHubPullRequestApi.ts";
import type { ProviderRepositoryRef } from "@t3tools/source-control-core/server/PullRequestProvider";

const HeadSchema = Schema.Struct({
  head: Schema.Struct({
    sha: Schema.String.check(Schema.isPattern(/^[a-f0-9]{40,64}$/)),
    // Null once the fork a pull request came from has been deleted.
    repo: Schema.NullOr(Schema.Struct({ id: PositiveInt })),
  }),
  base: Schema.Struct({ repo: Schema.Struct({ id: PositiveInt }) }),
});
const decodeHead = Schema.decodeUnknownEffect(Schema.fromJsonString(HeadSchema));

class ChecksUnavailable extends Schema.TaggedError<ChecksUnavailable>()("ChecksUnavailable", {}) {}

const WorkflowRunSchema = Schema.Struct({
  id: Schema.Int,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  html_url: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  conclusion: Schema.optional(Schema.NullOr(Schema.String)),
  head_branch: Schema.optional(Schema.NullOr(Schema.String)),
});
const decodeWorkflowRuns = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ workflow_runs: Schema.Array(WorkflowRunSchema) })),
);

export type KnownWorkflowRun = typeof WorkflowRunSchema.Type;

export const KnownWorkflowRuns = Context.Reference<{
  readonly headSha: string;
  readonly runs: ReadonlyArray<KnownWorkflowRun>;
} | null>("@t3tools/source-control-github/server/gitHubConditionalChecks/KnownWorkflowRuns", {
  defaultValue: () => null,
});

/** `next` is the API path of the following page, from the `Link` header; null on the last. */
type Validator = { etag: string | undefined; next: string | null; body: string };

const UNSUPPORTED_STATUSES = new Set([404, 405, 501]);

export const makeChecksRevalidator = Effect.gen(function* () {
  const api = yield* GitHubRest.GitHubRest;
  const entries = yield* Cache.makeWith(
    (_key: string) =>
      Effect.sync(() => ({
        gate: Semaphore.makeUnsafe(1),
        validators: new Map<string, Validator>(),
        head: null as typeof HeadSchema.Type | null,
        value: null as PullRequestChecks | null,
        readAt: 0,
        supported: true,
      })),
    { capacity: 128, timeToLive: () => "30 minutes" },
  );
  return (
    input: ProviderRepositoryRef & { readonly number: number },
    read: Effect.Effect<
      Pick<GitHubPullRequestDetail, "state" | "checks" | "headSha"> & {
        workflowApprovalsRequired?: number;
      },
      GitHubPullRequestApiError
    >,
  ) =>
    Effect.gen(function* () {
      const credential = yield* GitHubRequestPolicy.PinnedGitHubCredential;
      if (credential === null) return yield* read;
      const key = `${credential.credentialFingerprint}\0${input.host}\0${input.repository}\0${input.number}`;
      const entry = yield* Cache.get(entries, key);
      return yield* entry.gate.withPermit(
        Effect.gen(function* () {
          if (!entry.supported) return yield* read;
          const fail = (status: number) =>
            new GitHubRequestPolicy.GitHubApiResponseError({
              host: input.host,
              operation: "revalidateChecks",
              status,
            });
          /** What the endpoint answered, or null where the host cannot say. */
          const get = Effect.fn("gitHubConditionalChecks.get")(function* (
            endpoint: string,
            head = false,
          ) {
            const previous = entry.validators.get(endpoint);
            const response = yield* api
              .rest({
                host: input.host,
                operation: "revalidateChecks",
                path: endpoint,
                ...(previous?.etag ? { ifNoneMatch: previous.etag } : {}),
              })
              .pipe(
                Effect.catchTags({
                  GitHubApiNotFoundError: () =>
                    Effect.sync(() => {
                      entry.supported = false;
                      return null;
                    }),
                  GitHubApiResponseError: (error) =>
                    Effect.sync(() => {
                      entry.supported &&= !UNSUPPORTED_STATUSES.has(error.status);
                      return null;
                    }),
                }),
              );
            if (response === null) {
              entry.value = null;
              return null;
            }
            if (response.status === 304 && previous) return previous;
            if (response.status !== 200 || response.truncated) {
              return yield* fail(response.status);
            }
            entry.value = null;
            if (head) {
              const decoded = yield* decodeHead(response.body).pipe(
                Effect.mapError(() => fail(response.status)),
              );
              if (entry.head?.head.sha !== decoded.head.sha) entry.validators.clear();
              entry.head = decoded;
            }
            const validator = {
              etag: response.headers["etag"]?.trim(),
              next: yield* nextPagePath({
                host: input.host,
                operation: "revalidateChecks",
                link: response.headers["link"],
              }),
              body: response.body,
            };
            entry.validators.set(endpoint, validator);
            return validator;
          });
          const root = `repos/${input.repository}`;
          if ((yield* get(`${root}/pulls/${input.number}`, true)) === null) return yield* read;
          const head = entry.head;
          if (head === null) return yield* fail(200);
          const runsEndpoint =
            head.head.repo?.id !== head.base.repo.id
              ? `${root}/actions/runs?head_sha=${head.head.sha}&event=pull_request`
              : null;
          const endpoints = [
            `${root}/commits/${head.head.sha}/check-runs?filter=all`,
            `${root}/commits/${head.head.sha}/status`,
            ...(runsEndpoint === null ? [] : [runsEndpoint]),
          ];
          const runPages: Array<string> = [];
          // Each endpoint has its own cursor; only pages within one endpoint depend on each other.
          // An unavailable endpoint interrupts the others so the fallback read starts at once.
          const available = yield* Effect.forEach(
            endpoints,
            Effect.fn("gitHubConditionalChecks.revalidateEndpoint")(function* (endpoint) {
              // Follows the `Link` header's next page rather than counting `page=` numbers.
              let paged: string | null =
                `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100`;
              for (let page = 1; paged !== null; page++) {
                if (page > 100) return yield* fail(200);
                const answered: Validator | null = yield* get(paged);
                if (answered === null) return yield* new ChecksUnavailable();
                if (endpoint === runsEndpoint) runPages.push(paged);
                paged = answered.next;
              }
            }),
            { concurrency: 3, discard: true },
          ).pipe(
            Effect.as(true),
            Effect.catchTags({ ChecksUnavailable: () => Effect.succeed(false) }),
          );
          if (!available) return yield* read;
          const now = yield* Clock.currentTimeMillis;
          if (entry.value !== null && now - entry.readAt < 5 * 60_000) return entry.value;
          const pages = runPages.map((endpoint) =>
            decodeWorkflowRuns(entry.validators.get(endpoint)?.body ?? ""),
          );
          const known =
            runsEndpoint !== null && pages.every(Option.isSome)
              ? {
                  headSha: head.head.sha,
                  runs: pages.flatMap((page) =>
                    Option.isSome(page) ? page.value.workflow_runs : [],
                  ),
                }
              : null;
          const fresh = yield* read.pipe(Effect.provideService(KnownWorkflowRuns, known));
          const value = {
            state: fresh.state,
            checks: fresh.checks,
          };
          entry.value =
            fresh.workflowApprovalsRequired !== undefined && fresh.headSha === head.head.sha
              ? value
              : null;
          entry.readAt = now;
          return value;
        }),
      );
    });
});
