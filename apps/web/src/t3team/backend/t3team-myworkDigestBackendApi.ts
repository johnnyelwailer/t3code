/**
 * Client half of the My Work Digest graph endpoint
 * (`POST /api/t3team/mywork-digest/graph/poll`).
 *
 * Wire types mirror `apps/server/src/t3team-myworkDigestTypes.ts` (JSON
 * shapes only — this repo does not share TS between the two processes). The
 * server answers the same shape for the plain `/graph` route; the poll route
 * adds the fingerprint envelope so unchanged digests cost one word of body.
 */

import { postJson } from "./t3team-t3BackendHttp";

type DigestAccountRef = { readonly id: string; readonly provider: string };

export type MyWorkDigestProjectInput = {
  readonly account: DigestAccountRef;
  readonly externalProjectId: string;
  readonly appProjectId?: string;
  readonly name?: string;
};

export type MyWorkDigestScope = "project" | "all";

export type MyWorkDigestPollInput = {
  readonly scope: MyWorkDigestScope;
  readonly projects: ReadonlyArray<MyWorkDigestProjectInput>;
  /** The Jira display name the mirror assigns to the viewer (drives the burndown). */
  readonly viewer?: { readonly name?: string };
  /** The fingerprint from the previous round; lets the server answer `unchanged`. */
  readonly knownFingerprint?: string;
};

type DigestTicketRef = { readonly issueId?: string; readonly issueKey?: string };
type DigestSprint = {
  readonly name: string;
  readonly goal?: string;
  readonly startDate?: string;
  readonly endDate?: string;
};

/** The server's raw ticket ref: a mirror `resource_json` (ExternalResourceRef + extras). */
export type MyWorkDigestTicketRef = {
  readonly id: string;
  readonly displayId?: string;
  readonly parentId?: string;
  readonly status?: string;
  readonly assignee?: string;
  readonly updatedAt?: string;
  readonly [key: string]: unknown;
};

export type MyWorkDigestPayload = {
  readonly scope: MyWorkDigestScope;
  /**
   * The viewer as the server resolved them; fills in when the client has no cached name.
   * `unresolved` means a project had no Jira identity (stale or missing token).
   */
  readonly viewer?: { readonly name?: string; readonly unresolved?: true };
  readonly projects: ReadonlyArray<{
    readonly project: { readonly id: string; readonly name: string };
    readonly tickets: ReadonlyArray<MyWorkDigestTicketRef>;
    readonly claims: ReadonlyArray<{
      readonly threadId: string;
      readonly threadTitle: string;
      readonly ticketRef: DigestTicketRef;
      readonly agent: string;
      readonly lastActivityAt: string;
    }>;
    readonly decisions: ReadonlyArray<{
      readonly id: string;
      readonly threadId: string;
      readonly ticketRef: DigestTicketRef;
      readonly question: string;
      readonly askedAt: string;
    }>;
    readonly changeRequests: ReadonlyArray<{
      readonly id: string;
      readonly repo: string;
      readonly number: number;
      readonly state:
        | "draft"
        | "open"
        | "needs-you"
        | "changes-requested"
        | "ci-failing"
        | "approved"
        | "merged";
      readonly updatedAt: string;
      readonly workItemKey?: string;
      /** Open PRs only, off the server's cached detail read. */
      readonly reviewers?: ReadonlyArray<{ readonly name: string; readonly login: string }>;
      readonly unhandledReviewThreads?: ReadonlyArray<{ readonly lastCommentAt?: string }>;
    }>;
    /** PRs that gate a ticket: Jira "is blocked by" links or PR body mentions. */
    readonly blockers?: ReadonlyArray<{
      readonly ticketRef: DigestTicketRef;
      readonly repo: string;
      readonly number: number;
    }>;
    /** The viewer's personal burndown, in the project's estimate unit. */
    readonly burndown?: {
      readonly unit: "points" | "hours";
      readonly total: number;
      readonly points: ReadonlyArray<{ readonly date: string; readonly remaining: number }>;
    };
    readonly transitions: ReadonlyArray<{
      readonly ticketRef: DigestTicketRef;
      readonly from: string;
      readonly to: string;
      readonly at: string;
    }>;
    readonly sprint?: DigestSprint;
    readonly changeRequestNote?: string;
  }>;
};

export type MyWorkDigestPollResult =
  | { readonly unchanged: true; readonly fingerprint: string }
  | {
      readonly unchanged: false;
      readonly fingerprint: string;
      readonly value: MyWorkDigestPayload;
    };

export type MyWorkDigestPollFn = (input: MyWorkDigestPollInput) => Promise<MyWorkDigestPollResult>;

export function createMyWorkDigestBackendApi(httpBaseUrl: string) {
  return {
    async pollMyWorkDigest(input: MyWorkDigestPollInput): Promise<MyWorkDigestPollResult> {
      return postJson<
        {
          readonly scope: MyWorkDigestScope;
          readonly projects: ReadonlyArray<MyWorkDigestProjectInput>;
          readonly viewer?: { readonly name?: string };
          readonly poll: { readonly enabled: true; readonly knownFingerprint?: string };
        },
        MyWorkDigestPollResult
      >(
        httpBaseUrl,
        "/api/t3team/mywork-digest/graph/poll",
        {
          scope: input.scope,
          projects: input.projects,
          ...(input.viewer !== undefined ? { viewer: input.viewer } : {}),
          poll: {
            enabled: true,
            ...(input.knownFingerprint !== undefined
              ? { knownFingerprint: input.knownFingerprint }
              : {}),
          },
        },
        {
          // A cold Jira backlog cache makes the first digest load refresh it
          // server-side (12-17s observed vs the 15s default, which failed the
          // request seconds before the payload was ready). Warm loads return in
          // ~10ms, so this only matters on the first round after start or TTL.
          timeoutMs: 45_000,
        },
      );
    },
  };
}

/**
 * Feature-detects the digest endpoint: it may be absent on an older server.
 * The hook degrades to a readable `error` instead of throwing.
 */
export function readMyWorkDigestPollFn(backend: unknown): MyWorkDigestPollFn | undefined {
  const atlassian = (backend as { readonly atlassian?: unknown } | null)?.atlassian as
    | { readonly pollMyWorkDigest?: unknown }
    | undefined;
  const fn = atlassian?.pollMyWorkDigest;
  return typeof fn === "function" ? (fn as MyWorkDigestPollFn) : undefined;
}
