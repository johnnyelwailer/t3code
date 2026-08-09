import { describe, expect, it } from "vite-plus/test";

import { readIssueKeyFromHref } from "./t3team-useInAppIssueLinks";

describe("readIssueKeyFromHref", () => {
  it("recognises a Jira issue permalink", () => {
    expect(readIssueKeyFromHref("https://nexwork.atlassian.net/browse/IES-17140")).toBe(
      "IES-17140",
    );
  });

  it("tolerates a trailing slash and lowercase keys", () => {
    expect(readIssueKeyFromHref("https://x.atlassian.net/browse/abc-9/")).toBe("ABC-9");
  });

  it("ignores anything that is not an issue permalink", () => {
    // A Confluence page, a browse path with no key, and a bare project link are all not issues.
    expect(
      readIssueKeyFromHref("https://nexwork.atlassian.net/wiki/spaces/IESNG/pages/390807/Foo"),
    ).toBeUndefined();
    expect(readIssueKeyFromHref("https://x.atlassian.net/browse/")).toBeUndefined();
    expect(readIssueKeyFromHref("https://x.atlassian.net/projects/IES")).toBeUndefined();
  });

  it("does not throw on an unparsable href", () => {
    expect(readIssueKeyFromHref("not a url")).toBeUndefined();
    expect(readIssueKeyFromHref("")).toBeUndefined();
  });
});
