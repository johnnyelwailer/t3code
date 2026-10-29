import { expect, it } from "@effect/vitest";

import { sourceControlDefinitions } from "./sourceControlDefinitions.ts";

/**
 * Fork coverage for the GitHub Enterprise host recognition grafted into the GitHub definition's
 * `recognizeRemote` (`t3team-githubEnterpriseHost.ts`). Kept apart from upstream's definition tests.
 */
const kindOf = (remoteUrl: string) => sourceControlDefinitions.recognizeRemote(remoteUrl)?.kind;

it("classifies GitHub Enterprise hosts as github", () => {
  expect(sourceControlDefinitions.recognizeRemote("git@nexplore.ghe.com:owner/repo.git")).toEqual({
    kind: "github",
    name: "GitHub Self-Hosted",
    baseUrl: "https://nexplore.ghe.com",
  });
  expect(kindOf("https://nexplore.ghe.com/owner/repo.git")).toBe("github");
  expect(kindOf("git@enterprise.ghe.localhost:owner/repo.git")).toBe("github");
});

it("keeps github.com and subdomains of github.com classified as github", () => {
  expect(kindOf("https://github.com/owner/repo")).toBe("github");
  expect(kindOf("https://my-enterprise.github.com/owner/repo")).toBe("github");
});

it("keeps self-hosted Enterprise Server hosts carrying a github/ghe label", () => {
  expect(kindOf("git@github.acme.com:owner/repo.git")).toBe("github");
  expect(kindOf("https://github.enterprise.local/owner/repo")).toBe("github");
  expect(kindOf("git@ghe.acme.internal:owner/repo.git")).toBe("github");
});

it("does not treat the bare ghe.com marketing domain or a github-like substring as GitHub", () => {
  expect(kindOf("https://ghe.com/owner/repo")).not.toBe("github");
  expect(kindOf("https://mygithubmirror.example.com/owner/repo")).not.toBe("github");
});

it("does not misclassify GitLab/Bitbucket hosts as GitHub", () => {
  expect(kindOf("https://gitlab.com/group/repo")).toBe("gitlab");
  expect(kindOf("git@bitbucket.org:workspace/repo.git")).toBe("bitbucket");
});
