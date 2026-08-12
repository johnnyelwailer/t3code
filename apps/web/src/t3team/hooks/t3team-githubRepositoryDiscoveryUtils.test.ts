import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";
import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import {
  mergeGitHubDiscoveryResults,
  parseGitHubAuth,
} from "./t3team-githubRepositoryDiscoveryUtils";

function discoveryWithGitHubAuth(
  auth: SourceControlDiscoveryResult["sourceControlProviders"][number]["auth"],
): SourceControlDiscoveryResult {
  return {
    versionControlSystems: [],
    sourceControlProviders: [
      {
        kind: "github",
        label: "GitHub",
        status: "available",
        version: Option.none(),
        installHint: "",
        detail: Option.none(),
        auth,
      },
    ],
  };
}

describe("parseGitHubAuth", () => {
  it("surfaces every authenticated host when signed in to more than one", () => {
    const result = parseGitHubAuth(
      discoveryWithGitHubAuth({
        status: "authenticated",
        account: Option.some("octocat"),
        host: Option.some("github.com"),
        detail: Option.none(),
        accounts: [
          { host: "github.com", account: Option.some("octocat"), active: true },
          { host: "nexplore.ghe.com", account: Option.some("octocat-work"), active: false },
        ],
      }),
    );

    expect(result.status).toBe("authenticated");
    expect(result.host).toBe("github.com");
    expect(result.accounts).toEqual([
      { host: "github.com", account: "octocat", active: true },
      { host: "nexplore.ghe.com", account: "octocat-work", active: false },
    ]);
  });

  it("returns an empty accounts list when only a single host is authenticated", () => {
    const result = parseGitHubAuth(
      discoveryWithGitHubAuth({
        status: "authenticated",
        account: Option.some("octocat"),
        host: Option.some("github.com"),
        detail: Option.none(),
        accounts: [{ host: "github.com", account: Option.some("octocat"), active: true }],
      }),
    );

    expect(result.accounts).toEqual([{ host: "github.com", account: "octocat", active: true }]);
  });

  it("defaults accounts to an empty array when the provider omits it entirely", () => {
    const result = parseGitHubAuth(
      discoveryWithGitHubAuth({
        status: "unauthenticated",
        account: Option.none(),
        host: Option.some("github.com"),
        detail: Option.some("Run `gh auth login`."),
      }),
    );

    expect(result.accounts).toEqual([]);
  });

  it("reports unknown with no accounts when no GitHub provider was discovered", () => {
    const result = parseGitHubAuth({ versionControlSystems: [], sourceControlProviders: [] });

    expect(result.status).toBe("unknown");
    expect(result.accounts).toEqual([]);
  });
});

describe("mergeGitHubDiscoveryResults", () => {
  it("combines suggestions from every connected host and keeps the active host first", () => {
    expect(
      mergeGitHubDiscoveryResults(
        [
          {
            host: "github.com",
            account: "octocat",
            suggestedRepositoryUrls: ["https://github.com/acme/app"],
          },
          {
            host: "nexplore.ghe.com",
            account: "octocat-work",
            suggestedRepositoryUrls: [
              "https://nexplore.ghe.com/acme/app",
              "https://github.com/acme/app",
            ],
          },
        ],
        "nexplore.ghe.com",
      ),
    ).toEqual({
      githubHost: "nexplore.ghe.com",
      githubAccount: "octocat-work",
      suggestedUrls: ["https://github.com/acme/app", "https://nexplore.ghe.com/acme/app"],
    });
  });

  it("preserves warnings from successful host searches", () => {
    expect(
      mergeGitHubDiscoveryResults([
        {
          host: "github.com",
          suggestedRepositoryUrls: [],
          inboxWarning: "GitHub inbox access is unavailable.",
        },
      ]),
    ).toMatchObject({
      githubHost: "github.com",
      suggestedUrls: [],
      discoveryWarning: "GitHub inbox access is unavailable.",
    });
  });
});
