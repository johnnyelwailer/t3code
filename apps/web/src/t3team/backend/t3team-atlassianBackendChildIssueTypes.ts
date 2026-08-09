export type AtlassianChildIssueType = {
  readonly id: string;
  readonly name: string;
};

/** Split out of `AtlassianBackendApi` so `t3team-atlassianBackendTypes.ts` stays under the
 * additive-guard line cap — the child-issue-type picker's only data source, never a hardcoded list. */
export interface AtlassianChildIssueBackendApi {
  readonly listChildIssueTypes: (input: {
    readonly accountId: string;
    readonly projectId: string;
  }) => Promise<ReadonlyArray<AtlassianChildIssueType>>;
}
