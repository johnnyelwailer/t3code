import { describe, expect, it } from "vite-plus/test";

import { pullRequestIdentityOfActivityItem } from "./t3team-githubActivityPullRequestIdentity";

describe("pullRequestIdentityOfActivityItem", () => {
  it("reads host, repository and number from a host-prefixed id", () => {
    expect(
      pullRequestIdentityOfActivityItem({
        id: "nexplore.ghe.com:hive/nx-nexi#412",
        repository: "hive/nx-nexi",
        subjectType: "PullRequest",
      }),
    ).toEqual({ host: "nexplore.ghe.com", repository: "hive/nx-nexi", number: 412 });
  });

  it("takes the host from the subject URL when the id has none", () => {
    expect(
      pullRequestIdentityOfActivityItem({
        id: "hive/nx-nexi#7",
        repository: "hive/nx-nexi",
        subjectUrl: "https://github.com/hive/nx-nexi/pull/7",
      }),
    ).toEqual({ host: "github.com", repository: "hive/nx-nexi", number: 7 });
  });

  it("is null for an issue or for an item without a number", () => {
    expect(
      pullRequestIdentityOfActivityItem({ id: "x#3", repository: "x", subjectType: "Issue" }),
    ).toBeNull();
    expect(
      pullRequestIdentityOfActivityItem({ id: "hive/nx-nexi", repository: "hive/nx-nexi" }),
    ).toBeNull();
  });
});
