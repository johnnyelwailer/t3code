import * as AzureDevOpsCli from "@t3tools/source-control-azure-devops/server/AzureDevOpsCli";
import * as AzureDevOpsPullRequestCli from "@t3tools/source-control-azure-devops/server/AzureDevOpsPullRequestCli";
import * as AzureDevOpsDriver from "@t3tools/source-control-azure-devops/server/driver";
import * as BitbucketApi from "@t3tools/source-control-bitbucket/server/BitbucketApi";
import * as BitbucketPullRequestApi from "@t3tools/source-control-bitbucket/server/BitbucketPullRequestApi";
import * as BitbucketDriver from "@t3tools/source-control-bitbucket/server/driver";
import * as ForgejoCli from "@t3tools/source-control-forgejo/server/ForgejoCli";
import * as ForgejoDriver from "@t3tools/source-control-forgejo/server/driver";
import * as GitCafeApi from "@t3tools/source-control-gitcafe/server/GitCafeApi";
import * as GitCafeCredentials from "@t3tools/source-control-gitcafe/server/GitCafeCredentials";
import * as GitCafeDriver from "@t3tools/source-control-gitcafe/server/driver";
import * as T3TeamGitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as GitHubPullRequestApi from "@t3tools/source-control-github/server/GitHubPullRequestApi";
import * as GitHubDriver from "@t3tools/source-control-github/server/driver";
import * as GitLabCli from "@t3tools/source-control-gitlab/server/GitLabCli";
import * as GitLabPullRequestCli from "@t3tools/source-control-gitlab/server/GitLabPullRequestCli";
import * as GitLabDriver from "@t3tools/source-control-gitlab/server/driver";
import type { SourceControlDriver } from "@t3tools/source-control-core/server/driver";
import * as Layer from "effect/Layer";

import * as ServerSourceControlHost from "./ServerSourceControlHost.ts";

const drivers = [
  GitHubDriver.driver,
  GitLabDriver.driver,
  AzureDevOpsDriver.driver,
  BitbucketDriver.driver,
  ForgejoDriver.driver,
  GitCafeDriver.driver,
];

export type BuiltInSourceControlDriversEnv =
  (typeof drivers)[number] extends SourceControlDriver<infer R> ? R : never;

export const BUILT_IN_SOURCE_CONTROL_DRIVERS: ReadonlyArray<
  SourceControlDriver<BuiltInSourceControlDriversEnv>
> = drivers;

/**
 * The GitHub transport with the credential, quota and pause its readers share: upstream's
 * `GitHubRest.layerWithDependencies` plus the fork's `GitHubApi` facade over it (t3team).
 */
type GitHubTransportLayer = typeof T3TeamGitHubApi.layerWithDependencies;

/**
 * The services the built-in drivers' packages own, plus the host port they all run against.
 * `gitHubTransport` is the one GitHub transport every GitHub reader shares (its quota reserve,
 * rate-limit pause and read coalescer); a caller that already holds the server's instance passes
 * it so it is not built a second time.
 */
export const makeLayer = (
  gitHubTransport: GitHubTransportLayer = T3TeamGitHubApi.layerWithDependencies,
) =>
  Layer.mergeAll(
    GitHubPullRequestApi.layer.pipe(Layer.provideMerge(gitHubTransport)),
    AzureDevOpsPullRequestCli.layer.pipe(Layer.provideMerge(AzureDevOpsCli.layer)),
    BitbucketPullRequestApi.layer.pipe(Layer.provideMerge(BitbucketApi.layer)),
    ForgejoCli.layer,
    GitCafeApi.layer.pipe(Layer.provideMerge(GitCafeCredentials.layer)),
    GitLabPullRequestCli.layer.pipe(Layer.provideMerge(GitLabCli.layer)),
  ).pipe(Layer.provideMerge(ServerSourceControlHost.layer));

export const layer = makeLayer();
