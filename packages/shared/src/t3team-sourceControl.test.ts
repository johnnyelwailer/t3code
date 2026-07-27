import { describe, expect, it } from "vite-plus/test";

import { detectSourceControlProviderFromRemoteUrl } from "./sourceControl.ts";

/**
 * Additive coverage for the GitHub Enterprise host fix in `isGitHubHost` (`sourceControl.ts`).
 * Kept in a separate `t3team-` prefixed file rather than editing the upstream
 * `sourceControl.test.ts` directly, per the additive guard's whitelist.
 */
describe("detectSourceControlProviderFromRemoteUrl (GitHub Enterprise)", () => {
  it("classifies GitHub Enterprise hosts as github", () => {
    expect(detectSourceControlProviderFromRemoteUrl("git@nexplore.ghe.com:owner/repo.git")).toEqual(
      {
        kind: "github",
        name: "GitHub Self-Hosted",
        baseUrl: "https://nexplore.ghe.com",
      },
    );
    expect(
      detectSourceControlProviderFromRemoteUrl("https://nexplore.ghe.com/owner/repo.git")?.kind,
    ).toBe("github");
    expect(
      detectSourceControlProviderFromRemoteUrl("git@enterprise.ghe.localhost:owner/repo.git")?.kind,
    ).toBe("github");
  });

  it("keeps github.com and subdomains of github.com classified as github", () => {
    expect(detectSourceControlProviderFromRemoteUrl("https://github.com/owner/repo")?.kind).toBe(
      "github",
    );
    expect(
      detectSourceControlProviderFromRemoteUrl("https://my-enterprise.github.com/owner/repo")
        ?.kind,
    ).toBe("github");
  });

  it("does not misclassify GitLab/Bitbucket hosts as GitHub", () => {
    expect(detectSourceControlProviderFromRemoteUrl("https://gitlab.com/group/repo")?.kind).toBe(
      "gitlab",
    );
    expect(
      detectSourceControlProviderFromRemoteUrl("git@bitbucket.org:workspace/repo.git")?.kind,
    ).toBe("bitbucket");
  });
});
