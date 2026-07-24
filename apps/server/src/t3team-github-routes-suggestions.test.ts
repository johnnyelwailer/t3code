import { describe, expect, it } from "vite-plus/test";

import {
  filterInboxItemsToLinkedRepositories,
  hydrateInboxRepositoryUrls,
} from "./t3team-github-routes-suggestions.ts";

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
});
