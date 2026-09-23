import { describe, expect, it } from "vite-plus/test";

import {
  pullRequestDetailFileFromSearch,
  pullRequestDetailTabFromSearch,
  pullRequestDetailViewStateMatches,
  pullRequestDetailViewStateSearchFields,
  pullRequestDetailViewStateSearchPatch,
} from "./t3team-prDetailViewState.logic";

describe("pullRequestDetailTabFromSearch", () => {
  it("accepts every tab the panel opens", () => {
    expect(pullRequestDetailTabFromSearch("summary")).toBe("summary");
    expect(pullRequestDetailTabFromSearch("timeline")).toBe("timeline");
    expect(pullRequestDetailTabFromSearch("code")).toBe("code");
  });

  it("rejects values the panel does not open", () => {
    expect(pullRequestDetailTabFromSearch("Code")).toBeUndefined();
    expect(pullRequestDetailTabFromSearch("commits")).toBeUndefined();
    expect(pullRequestDetailTabFromSearch("")).toBeUndefined();
  });

  it("rejects values that are not strings", () => {
    expect(pullRequestDetailTabFromSearch(1)).toBeUndefined();
    expect(pullRequestDetailTabFromSearch(null)).toBeUndefined();
    expect(pullRequestDetailTabFromSearch(undefined)).toBeUndefined();
  });
});

describe("pullRequestDetailFileFromSearch", () => {
  it("trims and returns the path", () => {
    expect(pullRequestDetailFileFromSearch(" apps/web/src/index.css ")).toBe(
      "apps/web/src/index.css",
    );
  });

  it("treats blank values as absent", () => {
    expect(pullRequestDetailFileFromSearch("")).toBeUndefined();
    expect(pullRequestDetailFileFromSearch("   ")).toBeUndefined();
  });

  it("caps a hostile value so a link cannot bloat itself", () => {
    const long = `apps/web/src/${"a".repeat(600)}.ts`;
    expect(pullRequestDetailFileFromSearch(long)).toHaveLength(500);
  });

  it("rejects values that are not strings", () => {
    expect(pullRequestDetailFileFromSearch({ path: "x" })).toBeUndefined();
    expect(pullRequestDetailFileFromSearch(null)).toBeUndefined();
  });
});

describe("pullRequestDetailViewStateSearchFields", () => {
  it("passes through the valid fields of a deep link", () => {
    expect(pullRequestDetailViewStateSearchFields({ tab: "code", file: "a/b.ts" })).toEqual({
      tab: "code",
      file: "a/b.ts",
    });
  });

  it("drops fields the panel would not honor", () => {
    expect(pullRequestDetailViewStateSearchFields({ tab: "nope", file: 7 })).toEqual({});
  });

  it("keeps the valid field when the other one is not", () => {
    expect(pullRequestDetailViewStateSearchFields({ tab: "code", file: "" })).toEqual({
      tab: "code",
    });
  });
});

describe("pullRequestDetailViewStateSearchPatch", () => {
  it("leaves the default view out of the link", () => {
    expect(pullRequestDetailViewStateSearchPatch({ tab: "summary", file: null })).toEqual({});
  });

  it("names every part of a view the reader actually chose", () => {
    expect(pullRequestDetailViewStateSearchPatch({ tab: "code", file: "a/b.ts" })).toEqual({
      tab: "code",
      file: "a/b.ts",
    });
    expect(pullRequestDetailViewStateSearchPatch({ tab: "timeline", file: null })).toEqual({
      tab: "timeline",
    });
  });
});

describe("pullRequestDetailViewStateMatches", () => {
  it("reads an empty search as the default view", () => {
    expect(pullRequestDetailViewStateMatches({}, { tab: "summary", file: null })).toBe(true);
  });

  it("recognizes the view the search spells out", () => {
    expect(
      pullRequestDetailViewStateMatches(
        { tab: "code", file: "a/b.ts" },
        { tab: "code", file: "a/b.ts" },
      ),
    ).toBe(true);
  });

  it("reports a tab or file the search got wrong", () => {
    expect(
      pullRequestDetailViewStateMatches({ tab: "code" }, { tab: "timeline", file: null }),
    ).toBe(false);
    expect(
      pullRequestDetailViewStateMatches(
        { tab: "code", file: "old.ts" },
        { tab: "code", file: "new.ts" },
      ),
    ).toBe(false);
  });

  it("tolerates a tab the search does not spell but the view has moved to", () => {
    // The default tab is never written to the URL, so its absence matches summary —
    // and its presence matches everything else.
    expect(
      pullRequestDetailViewStateMatches({ tab: "summary" }, { tab: "summary", file: null }),
    ).toBe(true);
    expect(pullRequestDetailViewStateMatches({}, { tab: "code", file: null })).toBe(false);
  });
});
