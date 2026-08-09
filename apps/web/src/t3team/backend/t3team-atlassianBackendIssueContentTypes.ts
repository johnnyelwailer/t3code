export type AtlassianIssueLinkType = {
  readonly id: string;
  readonly name: string;
  readonly inward: string;
  readonly outward: string;
};

/** Comment and issue-link write ops, split out of `AtlassianBackendApi` so
 * `t3team-atlassianBackendTypes.ts` stays under the additive-guard line cap. */
export interface AtlassianIssueContentBackendApi {
  readonly addIssueComment: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly body: string;
  }) => Promise<{ id: string }>;
  readonly updateIssueComment: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly commentId: string;
    readonly body: string;
  }) => Promise<void>;
  readonly deleteIssueComment: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly commentId: string;
  }) => Promise<void>;
  readonly createIssueLink: (input: {
    readonly accountId: string;
    readonly issueIdOrKey: string;
    readonly otherIssueIdOrKey: string;
    readonly linkTypeName: string;
    readonly direction: "inward" | "outward";
  }) => Promise<void>;
  readonly deleteIssueLink: (input: {
    readonly accountId: string;
    readonly linkId: string;
  }) => Promise<void>;
  readonly listIssueLinkTypes: (input: {
    readonly accountId: string;
  }) => Promise<ReadonlyArray<AtlassianIssueLinkType>>;
}
