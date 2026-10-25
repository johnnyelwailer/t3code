/**
 * Request builders for driving one cloud-session workflow through GitHub's API. The parsers for
 * what they bring back live in `t3team-githubActionsSessionParse.ts`.
 *
 * Pure on purpose: no I/O, no Effect, no network. The service layer owns
 * execution via `GitHubApi`, which is how the rest of this repo talks to
 * GitHub — so a cloud session inherits the user's existing credential for the
 * host (a `gh` login, a token in Settings or the environment) and needs none
 * of its own.
 *
 * Vendor-named deliberately: the provisioning mechanics here genuinely are
 * GitHub Actions'. The neutral vocabulary lives one layer up, in the
 * `cloudSession` contract and `CloudSessionService`.
 */

export interface CloudSessionRepoRef {
  /** GitHub host, e.g. "nexplore.ghe.com". Picks the credential and the API base URL. */
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
  /** Workflow file name, e.g. "session.yml". */
  readonly workflowFileName: string;
}

export interface WorkflowRunSummary {
  readonly id: number;
  readonly status: string;
  readonly conclusion: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly htmlUrl: string;
  /** Display name. The workflow echoes `session_tag` here so a dispatch can find its run. */
  readonly name: string;
  /** Who started the run. This GHE ignores `actor=` on the list query, so filter on this. */
  readonly actor: string;
  /** Which attempt of the run this is; a re-run keeps `id` and bumps this. Absent reads as 1. */
  readonly runAttempt?: number;
}

/** Wrap a correlation tag the way `run-name` renders it. */
export function sessionTagMarker(tag: string): string {
  return `[${tag}]`;
}

export interface WorkflowJobStep {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  /** When the step began (ISO 8601); absent for a step that has not started or a reply without it. */
  readonly startedAt?: string | null;
}

/**
 * One request against the session's host. A payload rides in `body`, never in a URL or an argv,
 * so a credential or a session payload cannot surface in a process listing or a trace.
 */
export type GitHubActionsRequest =
  | {
      readonly kind: "rest";
      /** Names the call in traces and rate-limit accounting. */
      readonly operation: string;
      readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      /** Relative to the host's API root, e.g. `repos/acme/fleet/actions/runs`. */
      readonly path: string;
      readonly body?: unknown;
      /**
       * Only for a GET the session may cache: `settled` marks data about a run that has
       * finished, which can never change again, so it is kept far longer than a live read.
       */
      readonly lifetime?: "live" | "settled";
      /** The run attempt a cached read belongs to; part of its cache identity. */
      readonly attempt?: number;
      /** A background read may be shared process-wide for this long (see `GitHubRestInput`). */
      readonly coalesce?: { readonly ttlMs: number };
    }
  | {
      readonly kind: "graphql";
      readonly operation: string;
      readonly query: string;
      readonly variables?: Readonly<Record<string, unknown>>;
    };

/** What an executed request looks like to the parsers here. */
export interface GitHubActionsResponse {
  readonly body: string;
  /** The answer was cut at the transport's size limit, so it must not be read as complete. */
  readonly truncated: boolean;
}

export const repoApiPath = (ref: CloudSessionRepoRef, suffix: string): string =>
  `repos/${ref.owner}/${ref.repo}/${suffix}`;

export function dispatchSessionRequest(
  ref: CloudSessionRepoRef,
  inputs: Readonly<Record<string, string>>,
): GitHubActionsRequest {
  return {
    kind: "rest",
    operation: "cloudSession.dispatch",
    method: "POST",
    path: repoApiPath(ref, `actions/workflows/${ref.workflowFileName}/dispatches`),
    // The endpoint answers 204 with an empty body; nothing to parse.
    body: { ref: "main", inputs },
  };
}

/**
 * List session-workflow runs. `actor=` is included, but this GHE ignores it
 * (`created_by` too); `sessionRunsForLogin` is what actually scopes the list.
 */
/** Concurrent surfaces and WebSocket clients of one server share a runs listing this long. */
const RUNS_COALESCE_MS = 4_000;
/** The signed-in identity does not move on the poll cadence. */
const LOGIN_COALESCE_MS = 60_000;

export function listRunsRequest(
  ref: CloudSessionRepoRef,
  limit: number,
  actor?: string,
): GitHubActionsRequest {
  const query =
    actor === undefined
      ? `per_page=${limit}`
      : `per_page=${limit}&actor=${encodeURIComponent(actor)}`;
  return {
    kind: "rest",
    operation: "cloudSession.listRuns",
    path: repoApiPath(ref, `actions/workflows/${ref.workflowFileName}/runs?${query}`),
    coalesce: { ttlMs: RUNS_COALESCE_MS },
  };
}

/**
 * Resolve the GitHub login the fleet host's credential belongs to. Same host and same credential
 * as dispatch, so a run's `actor` matches it exactly — what makes scoping the list to "my
 * sessions" sound.
 */
export function currentLoginRequest(_ref: CloudSessionRepoRef): GitHubActionsRequest {
  return {
    kind: "rest",
    operation: "cloudSession.viewer",
    path: "user",
    coalesce: { ttlMs: LOGIN_COALESCE_MS },
  };
}

/**
 * `settled` is a run that has completed: its steps are final, so the read is cached long — but
 * only when `attempt` is known, since without it a re-run (same run id) cannot be told apart.
 */
export function jobStepsRequest(
  ref: CloudSessionRepoRef,
  runId: number,
  settled = false,
  attempt?: number,
): GitHubActionsRequest {
  return {
    kind: "rest",
    operation: "cloudSession.jobSteps",
    path: repoApiPath(ref, `actions/runs/${runId}/jobs`),
    lifetime: settled && attempt !== undefined ? "settled" : "live",
    ...(attempt === undefined ? {} : { attempt }),
  };
}

export function cancelRunRequest(ref: CloudSessionRepoRef, runId: number): GitHubActionsRequest {
  return {
    kind: "rest",
    operation: "cloudSession.cancelRun",
    method: "POST",
    path: repoApiPath(ref, `actions/runs/${runId}/cancel`),
  };
}
