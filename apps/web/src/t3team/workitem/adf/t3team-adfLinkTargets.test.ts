import { describe, expect, it } from "vite-plus/test";

import { adfLinkDisplayText, jiraIssueKeyFromUrl, safeAdfHref } from "./t3team-adfLinkTargets";
import { extractAdfPlainText } from "./t3team-adfNodeText";
import { adfPanelTone, adfStatusTone, adfTextColor } from "./t3team-adfColorTokens";
import type { AdfNode } from "./t3team-adfRendererTypes";

describe("safeAdfHref", () => {
  it("keeps http, https, mailto, tel, root-relative and hash targets", () => {
    expect(safeAdfHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeAdfHref("http://example.com")).toBe("http://example.com");
    expect(safeAdfHref("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeAdfHref("tel:+41000")).toBe("tel:+41000");
    expect(safeAdfHref("/browse/ABC-1")).toBe("/browse/ABC-1");
    expect(safeAdfHref("#section")).toBe("#section");
  });

  it("rejects script-capable and unknown schemes", () => {
    expect(safeAdfHref("javascript:alert(1)")).toBeUndefined();
    expect(safeAdfHref("JavaScript:alert(1)")).toBeUndefined();
    expect(safeAdfHref("data:text/html,<script>")).toBeUndefined();
    expect(safeAdfHref("vbscript:msgbox")).toBeUndefined();
    expect(safeAdfHref("//evil.example.com")).toBeUndefined();
    expect(safeAdfHref("   ")).toBeUndefined();
    expect(safeAdfHref(undefined)).toBeUndefined();
  });
});

describe("jiraIssueKeyFromUrl", () => {
  it("extracts keys from browse paths and selectedIssue params", () => {
    expect(jiraIssueKeyFromUrl("https://site.atlassian.net/browse/T3T-42")).toBe("T3T-42");
    expect(jiraIssueKeyFromUrl("/browse/abc-7")).toBe("ABC-7");
    expect(jiraIssueKeyFromUrl("https://site.atlassian.net/browse/AB_C-7?x=1")).toBe("AB_C-7");
    expect(
      jiraIssueKeyFromUrl("https://site.atlassian.net/jira/boards/1?selectedIssue=OPS-9"),
    ).toBe("OPS-9");
  });

  it("returns undefined for non-issue and unsafe URLs", () => {
    expect(jiraIssueKeyFromUrl("https://example.com/docs/browse/not-a-key")).toBeUndefined();
    expect(jiraIssueKeyFromUrl("javascript:/browse/ABC-1")).toBeUndefined();
    expect(jiraIssueKeyFromUrl(undefined)).toBeUndefined();
  });
});

describe("adfLinkDisplayText", () => {
  it("trims a URL down to host and path", () => {
    expect(adfLinkDisplayText("https://site.atlassian.net/wiki/Spec?utm=1")).toBe(
      "site.atlassian.net/wiki/Spec",
    );
    expect(adfLinkDisplayText("/wiki/Spec/")).toBe("/wiki/Spec");
  });
});

describe("adf colour tokens", () => {
  it("maps ADF colour vocabularies onto theme-pack semantic tones", () => {
    expect(adfStatusTone("purple")).toBe("primary");
    expect(adfStatusTone("blue")).toBe("info");
    expect(adfStatusTone("red")).toBe("danger");
    expect(adfStatusTone("yellow")).toBe("warning");
    expect(adfStatusTone("green")).toBe("success");
    expect(adfStatusTone("neutral")).toBe("muted");
    expect(adfStatusTone("chartreuse")).toBe("muted");
    expect(adfPanelTone("note")).toBe("primary");
    expect(adfPanelTone("error")).toBe("danger");
    expect(adfPanelTone(undefined)).toBe("info");
  });

  it("only honours a strict #rrggbb author text colour", () => {
    expect(adfTextColor("#BF2600")).toBe("#bf2600");
    expect(adfTextColor("#fff")).toBeUndefined();
    expect(adfTextColor("red")).toBeUndefined();
    expect(adfTextColor("#12345g")).toBeUndefined();
    expect(adfTextColor(undefined)).toBeUndefined();
  });
});

describe("extractAdfPlainText", () => {
  it("flattens nested content without recursion and separates blocks", () => {
    let node: AdfNode = { type: "paragraph", content: [{ type: "text", text: "deep" }] };
    for (let index = 0; index < 5_000; index += 1) {
      node = { type: "blockquote", content: [node] };
    }
    expect(extractAdfPlainText(node)).toBe("deep");

    const doc: AdfNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "first" }] },
        { type: "paragraph", content: [{ type: "text", text: "second" }] },
      ],
    };
    expect(extractAdfPlainText(doc)).toBe("first\nsecond");
  });

  it("falls back to readable attrs and respects the budget", () => {
    expect(extractAdfPlainText({ type: "emoji", attrs: { shortName: ":tada:" } })).toBe(":tada:");
    expect(extractAdfPlainText({ type: "text", text: "abcdef" }, 3)).toBe("abc");
    expect(extractAdfPlainText({ type: "unknownThing" })).toBe("");
  });
});
