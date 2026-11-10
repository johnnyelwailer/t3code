import { OrchestratorMcpFailure } from "@t3tools/contracts";
import type * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";

import { HANDBOOK_HOST, HANDBOOK_REPOSITORY } from "./t3team-handbookConfig.ts";

/** Map GitHub credential/API failures to clear tool errors. Never include the token. */
function handbookCredentialFailure(error: GitHubApi.GitHubApiError): OrchestratorMcpFailure {
  switch (error._tag) {
    case "GitHubCliMissingError":
    case "GitHubNotSignedInError":
    case "GitHubHostDisabledError":
    case "GitHubCliFailedError":
      return new OrchestratorMcpFailure({
        code: "invalid_request",
        message: `No usable GitHub credential for ${HANDBOOK_HOST}. Set GH_ENTERPRISE_TOKEN (with GH_HOST=${HANDBOOK_HOST}), GH_TOKEN/GITHUB_TOKEN, or run \`gh auth login --hostname ${HANDBOOK_HOST}\`.`,
      });
    case "GitHubApiAuthenticationError":
      return new OrchestratorMcpFailure({
        code: "invalid_request",
        message: `GitHub rejected the credential for ${HANDBOOK_HOST}. Refresh GH_ENTERPRISE_TOKEN / GH_TOKEN or run \`gh auth login --hostname ${HANDBOOK_HOST}\`.`,
      });
    case "GitHubApiNotFoundError":
      return new OrchestratorMcpFailure({
        code: "invalid_request",
        message: `Handbook repository ${HANDBOOK_REPOSITORY} was not found, or this credential cannot see it on ${HANDBOOK_HOST}.`,
      });
    case "GitHubApiRateLimitError":
    case "SourceControlRateLimitPausedError":
      return new OrchestratorMcpFailure({
        code: "orchestration_error",
        message: "GitHub rate-limited handbook reads. Try again shortly.",
      });
    default:
      return new OrchestratorMcpFailure({
        code: "orchestration_error",
        message: `Could not read the Nexplore Developer Handbook from ${HANDBOOK_HOST}.`,
      });
  }
}

export function handbookRestFailure(
  error: GitHubApi.GitHubApiError,
  input: { readonly operation: string; readonly path: string },
): OrchestratorMcpFailure {
  if (error._tag === "GitHubApiNotFoundError" && input.operation === "handbook.contents") {
    return new OrchestratorMcpFailure({
      code: "invalid_request",
      message: `Handbook page not found: ${input.path.replace(/^repos\/[^/]+\/[^/]+\/contents\//, "")}`,
    });
  }
  return handbookCredentialFailure(error);
}
