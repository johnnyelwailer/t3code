/**
 * `ctx.changeRequests.list`: the viewer's change requests on the run's project, the same listing
 * the app's pull request page shows. It spans the project's own repository and its linked
 * repositories and nothing else.
 */

/** How the signed-in viewer is involved: wrote it, or is asked to review it. */
export type ChangeRequestInvolvement = "authored" | "reviewing";

export interface ChangeRequestListOptions {
  /** Defaults to `"open"`. */
  readonly state?: "open" | "closed" | "merged" | "all";
  /** `"all"` (the default) asks for every row of the project, involved or not. */
  readonly involvement?: ChangeRequestInvolvement | "all";
  /** Rows per repository, 1..500; the host's default when absent. */
  readonly limit?: number;
}

export interface ChangeRequestListEntry {
  readonly provider: string;
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed" | "merged";
  readonly isDraft: boolean;
  readonly author: { readonly login: string; readonly name: string | null } | null;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly labels: ReadonlyArray<string>;
  readonly updatedAt: string;
  /** Which involvements this row matches for the viewer on its host; empty when neither. */
  readonly involvement: ReadonlyArray<ChangeRequestInvolvement>;
}

export interface ChangeRequestList {
  readonly entries: ReadonlyArray<ChangeRequestListEntry>;
  /** The signed-in login per host. A host that could not be read is absent. */
  readonly viewers: Readonly<Record<string, string>>;
  /** Hosts the listing could not read, with the reason (signed out, CLI missing). */
  readonly unreadable: ReadonlyArray<{ readonly host: string; readonly detail: string | null }>;
  /** Repositories of the project whose listing failed; the rest still answered. */
  readonly errors: ReadonlyArray<string>;
  /** At least one repository hit the per-repository row cap. */
  readonly truncated: boolean;
}
