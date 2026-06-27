import { AsyncResult } from "effect/unstable/reactivity";
import type { EnvironmentId, SourceControlDiscoveryResult } from "@t3tools/contracts";
import { parseGitHubHostFromDiscovery, parseOptionString } from "~/t3work/t3work-githubActivity";

type DiscoverSourceControl = (target: {
  readonly environmentId: EnvironmentId;
  readonly input: {};
}) => Promise<
  | AsyncResult.Success<SourceControlDiscoveryResult, unknown>
  | AsyncResult.Failure<SourceControlDiscoveryResult, unknown>
>;

export async function resolveProjectGitHubActivityDiscovery(input: {
  readonly environmentId: EnvironmentId | null;
  readonly discoverSourceControl: DiscoverSourceControl;
  readonly host: string;
  readonly account: string | undefined;
}) {
  if (input.environmentId === null || (input.host && input.host !== "github.com")) {
    return { host: input.host, account: input.account };
  }

  const discoveryResult = await input.discoverSourceControl({
    environmentId: input.environmentId,
    input: {},
  });
  if (AsyncResult.isFailure(discoveryResult)) {
    return { host: input.host, account: input.account };
  }

  const discovery = discoveryResult.value;
  const githubProvider = discovery.sourceControlProviders.find(
    (provider) => provider.kind === "github",
  );
  return {
    host: parseGitHubHostFromDiscovery(discovery),
    account: githubProvider ? parseOptionString(githubProvider.auth.account) : input.account,
  };
}
