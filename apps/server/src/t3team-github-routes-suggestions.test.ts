import { describe, expect, it } from "vite-plus/test";

import {
  collectProjectSearchTerms,
  filterInboxItemsToLinkedRepositories,
  hydrateInboxRepositoryUrls,
  parseLinkedRepositoryTarget,
} from "./t3team-github-routes-suggestions.ts";

describe("collectProjectSearchTerms", () => {
  it("provides searchable project key and title terms", () => {
    expect(
      collectProjectSearchTerms({
        projectKey: "NEXI-42",
        projectTitle: "Nexi Distribution",
      }),
    ).toEqual(["nexi-42", "nexi", "distribution", "nexi-distribution"]);
  });
});

describe("filterInboxItemsToLinkedRepositories", () => {
  it("returns no inbox items when no linked repositories are configured", () => {
    const inboxItems = hydrateInboxRepositoryUrls("github.com", [
      {
        id: "1",
        repository: "acme/unlinked",
        reason: "mention",
      },
    ]);

    expect(
      filterInboxItemsToLinkedRepositories({
        host: "github.com",
        inboxItems,
        linkedRepositoryUrls: [],
      }),
    ).toEqual([]);
  });

  it("keeps only inbox items from linked repositories", () => {
    const inboxItems = hydrateInboxRepositoryUrls("github.com", [
      {
        id: "1",
        repository: "acme/linked",
        reason: "mention",
      },
      {
        id: "2",
        repository: "acme/other",
        reason: "mention",
      },
    ]);

    expect(
      filterInboxItemsToLinkedRepositories({
        host: "github.com",
        inboxItems,
        linkedRepositoryUrls: ["https://github.com/acme/linked"],
      }),
    ).toEqual([
      expect.objectContaining({
        id: "1",
        repository: "acme/linked",
      }),
    ]);
  });

  it("keeps a linked item from another host when its own URL is among the linked ones", () => {
    // A linked-PR item carries the URL of the host its repository lives on; the request's named
    // host (github.com here) must not disqualify a repository linked on a GitHub Enterprise host.
    const inboxItems = [
      {
        id: "1",
        repository: "acme/linked",
        reason: "pull request",
        repositoryUrl: "https://github.com/acme/linked",
      },
      {
        id: "2",
        repository: "acme/ghe-app",
        reason: "pull request",
        repositoryUrl: "https://nexpore.ghe.com/acme/ghe-app",
      },
      {
        id: "3",
        repository: "acme/unlinked",
        reason: "pull request",
        repositoryUrl: "https://nexpore.ghe.com/acme/unlinked",
      },
    ];

    expect(
      filterInboxItemsToLinkedRepositories({
        host: "github.com",
        inboxItems,
        linkedRepositoryUrls: [
          "https://github.com/acme/linked",
          "https://nexpore.ghe.com/acme/ghe-app",
        ],
      }).map((item) => item.id),
    ).toEqual(["1", "2"]);
  });
});

describe("parseLinkedRepositoryTarget", () => {
  it("reads the host and owner/repo from the URL itself", () => {
    expect(parseLinkedRepositoryTarget("https://nexpore.ghe.com/acme/ghe-app")).toEqual({
      host: "nexpore.ghe.com",
      repository: "acme/ghe-app",
    });
  });

  it("strips .git suffixes and rejects URLs without an owner/repo path", () => {
    expect(parseLinkedRepositoryTarget("https://github.com/acme/project.git")).toEqual({
      host: "github.com",
      repository: "acme/project",
    });
    expect(parseLinkedRepositoryTarget("https://github.com")).toBeUndefined();
    expect(parseLinkedRepositoryTarget("not a url")).toBeUndefined();
  });
});
