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
    }>;
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
          readonly poll: { readonly enabled: true; readonly knownFingerprint?: string };
        },
        MyWorkDigestPollResult
      >(httpBaseUrl, "/api/t3team/mywork-digest/graph/poll", {
        scope: input.scope,
        projects: input.projects,
        poll: {
          enabled: true,
          ...(input.knownFingerprint !== undefined
            ? { knownFingerprint: input.knownFingerprint }
            : {}),
        },
      });
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
