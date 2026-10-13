import { describe, expect, it } from "vite-plus/test";

import { mergeRepositoriesMeta } from "./t3team-githubRepositoryDiscoveryUtils";

const result = (extra: { repositoriesFetchedAt?: string; repositoriesRefreshing?: true }) => ({
  host: "h",
  suggestedRepositoryUrls: [],
  ...extra,
});

describe("mergeRepositoriesMeta", () => {
  it("reports the oldest fetch across hosts so 'updated' never overstates", () => {
    expect(
      mergeRepositoriesMeta([
        result({ repositoriesFetchedAt: "2026-10-13T08:00:00.000Z" }),
        result({ repositoriesFetchedAt: "2026-10-13T05:00:00.000Z" }),
      ]),
    ).toEqual({ fetchedAt: "2026-10-13T05:00:00.000Z", refreshing: false });
  });

  it("is refreshing when any host is, and has no time when none was ever fetched", () => {
    expect(mergeRepositoriesMeta([result({}), result({ repositoriesRefreshing: true })])).toEqual({
      refreshing: true,
    });
  });
});
