/**
 * Public shape of `useMyWorkDigestGraph`: what the My Work views pass in and what they read back.
 */

import type { ProjectShellProject } from "@t3tools/project-context";

import type { MyWorkDigestScope } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

export type UseMyWorkDigestGraphInput = {
  /** The scoped project list: one entry for scope "project", all for "all". */
  readonly projects: ReadonlyArray<ProjectShellProject>;
  readonly scope?: MyWorkDigestScope;
  /** The viewer the plan heuristics match `assignee` against. */
  readonly viewer?: { readonly name?: string; readonly role?: string };
  readonly enabled?: boolean;
};

export type UseMyWorkDigestGraphResult = {
  readonly graph: DigestGraph | null;
  readonly status: "loading" | "ready" | "error";
  readonly error?: string;
  /** True when the server had no Jira identity for a project (stale or missing token). */
  readonly viewerUnresolved: boolean;
  /**
   * The server dropped a dead Jira refresh token: the view should offer a sign-in affordance
   * instead of the error string, and reload once the user signs back in.
   */
  readonly sessionExpired: boolean;
  readonly reload: () => void;
};
