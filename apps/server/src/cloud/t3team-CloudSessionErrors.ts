import { CloudSessionFailedError } from "@t3tools/contracts";

import * as GitHubCli from "../sourceControl/GitHubCli.ts";

/**
 * The error boundary between the GitHub CLI and the cloud session surface:
 * every `gh` failure the service hits is mapped here onto a reason the client
 * can act on.
 */

/** Bound what a provider error can contribute to a user-visible message. */
const ERROR_DETAIL_LIMIT = 300;

/**
 * `GitHubCli` already separates "gh missing" and "not logged in" from a plain
 * command failure, which is exactly the distinction the surface needs: the
 * first two mean *set something up*, the third means *this request failed*.
 */
export function toCloudSessionFailure(error: GitHubCli.GitHubCliError): CloudSessionFailedError {
  switch (error._tag) {
    case "GitHubCliUnavailableError":
      return new CloudSessionFailedError({
        reason: "not_configured",
        message: "The GitHub CLI is not installed, so cloud sessions cannot be started.",
      });
    case "GitHubCliAuthenticationError":
      return new CloudSessionFailedError({
        reason: "unauthorized",
        message: "The GitHub CLI is not signed in to the cloud session host.",
      });
    case "GitHubCliRateLimitError":
      return new CloudSessionFailedError({
        reason: "rejected",
        message: "The provider is rate limiting cloud session requests. Try again shortly.",
      });
    default:
      return new CloudSessionFailedError({
        reason: "rejected",
        message: String(error.message ?? "The provider refused the request.").slice(
          0,
          ERROR_DETAIL_LIMIT,
        ),
      });
  }
}
