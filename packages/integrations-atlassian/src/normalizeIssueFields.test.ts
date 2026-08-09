import { describe, expect, it } from "vite-plus/test";
import {
  extractAdfDocument,
  extractAffectsVersions,
  extractComponents,
  extractCreated,
  extractDueDate,
  extractFixVersions,
  extractHasVoted,
  extractIsWatching,
  extractParentSummary,
  extractResolutionName,
  extractResolvedAt,
  extractStatusCategory,
  extractTimeTracking,
  extractVoteCount,
  extractWatchCount,
  pickAvatarUrl,
} from "./normalizeIssueFields.ts";

describe("pickAvatarUrl", () => {
  it("prefers the largest available size", () => {
    expect(pickAvatarUrl({ "16x16": "a", "48x48": "b", "32x32": "c" })).toBe("b");
  });

  it("falls back to any value when preferred sizes are missing", () => {
    expect(pickAvatarUrl({ "16x16": "only" })).toBe("only");
  });

  it("returns undefined for missing avatarUrls", () => {
    expect(pickAvatarUrl(undefined)).toBeUndefined();
  });
});

describe("extractCreated / extractDueDate / extractResolvedAt", () => {
  it("reads the raw string fields, trimming empty strings to undefined", () => {
    expect(extractCreated({ created: "2026-01-01T00:00:00.000Z" })).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(extractDueDate({ duedate: "2026-02-01" })).toBe("2026-02-01");
    expect(extractResolvedAt({ resolutiondate: "2026-03-01T00:00:00.000Z" })).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(extractCreated({ created: "" })).toBeUndefined();
    expect(extractDueDate({})).toBeUndefined();
  });
});

describe("extractResolutionName", () => {
  it("reads resolution.name", () => {
    expect(extractResolutionName({ resolution: { name: "Fixed" } })).toBe("Fixed");
  });

  it("returns undefined when resolution is null (unresolved issue)", () => {
    expect(extractResolutionName({ resolution: null })).toBeUndefined();
  });
});

describe("extractComponents / extractFixVersions / extractAffectsVersions", () => {
  it("maps name arrays", () => {
    expect(extractComponents({ components: [{ name: "Backend" }, { name: "API" }] })).toEqual([
      "Backend",
      "API",
    ]);
    expect(extractFixVersions({ fixVersions: [{ name: "1.2.0" }] })).toEqual(["1.2.0"]);
    expect(extractAffectsVersions({ versions: [{ name: "1.0.0" }] })).toEqual(["1.0.0"]);
  });

  it("omits the key (returns undefined) for an empty or missing array", () => {
    expect(extractComponents({ components: [] })).toBeUndefined();
    expect(extractFixVersions({})).toBeUndefined();
  });
});

describe("extractWatchCount / extractIsWatching / extractVoteCount / extractHasVoted", () => {
  it("reads nested watches/votes fields", () => {
    expect(extractWatchCount({ watches: { watchCount: 3, isWatching: true } })).toBe(3);
    expect(extractIsWatching({ watches: { watchCount: 3, isWatching: true } })).toBe(true);
    expect(extractVoteCount({ votes: { votes: 5, hasVoted: false } })).toBe(5);
    expect(extractHasVoted({ votes: { votes: 5, hasVoted: false } })).toBe(false);
  });

  it("returns undefined when the parent field is missing", () => {
    expect(extractWatchCount({})).toBeUndefined();
    expect(extractVoteCount({})).toBeUndefined();
  });
});

describe("extractTimeTracking", () => {
  it("reads the nested timetracking seconds fields", () => {
    expect(
      extractTimeTracking({
        timetracking: {
          originalEstimateSeconds: 3600,
          remainingEstimateSeconds: 1800,
          timeSpentSeconds: 1800,
        },
      }),
    ).toEqual({
      originalEstimateSeconds: 3600,
      remainingEstimateSeconds: 1800,
      timeSpentSeconds: 1800,
    });
  });

  it("returns undefined when timetracking is absent or empty", () => {
    expect(extractTimeTracking({})).toBeUndefined();
    expect(extractTimeTracking({ timetracking: {} })).toBeUndefined();
  });
});

describe("extractStatusCategory", () => {
  it("reads status.statusCategory", () => {
    expect(
      extractStatusCategory({
        name: "In Progress",
        statusCategory: { key: "indeterminate", name: "In Progress", colorName: "yellow" },
      }),
    ).toEqual({ key: "indeterminate", name: "In Progress", colorName: "yellow" });
  });

  it("returns undefined when status has no statusCategory", () => {
    expect(extractStatusCategory({ name: "In Progress" })).toBeUndefined();
    expect(extractStatusCategory(undefined)).toBeUndefined();
  });
});

describe("extractAdfDocument", () => {
  it("returns the raw ADF object unmodified", () => {
    const doc = { type: "doc", version: 1, content: [] };
    expect(extractAdfDocument(doc)).toBe(doc);
  });

  it("returns undefined for a plain string or missing value", () => {
    expect(extractAdfDocument("plain text")).toBeUndefined();
    expect(extractAdfDocument(undefined)).toBeUndefined();
    expect(extractAdfDocument(null)).toBeUndefined();
  });
});

describe("extractParentSummary", () => {
  it("reads key/summary/issueType/issueTypeIconUrl/statusName from a Jira parent field", () => {
    expect(
      extractParentSummary({
        key: "TEST-1",
        fields: {
          summary: "Parent summary",
          issuetype: { name: "Epic", iconUrl: "https://example.com/epic.svg" },
          status: { name: "Done" },
        },
      }),
    ).toEqual({
      key: "TEST-1",
      summary: "Parent summary",
      issueType: "Epic",
      issueTypeIconUrl: "https://example.com/epic.svg",
      statusName: "Done",
    });
  });

  it("returns undefined when there is no parent", () => {
    expect(extractParentSummary(undefined)).toBeUndefined();
  });

  it("returns just the key when nested fields are missing", () => {
    expect(extractParentSummary({ key: "TEST-2" })).toEqual({ key: "TEST-2" });
  });
});
