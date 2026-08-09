import { describe, expect, it } from "vite-plus/test";

import { adfSmartLinkLabel } from "./t3team-adfSmartLinkLabel";

describe("adfSmartLinkLabel", () => {
  it("decodes a Confluence page title out of the URL", () => {
    expect(
      adfSmartLinkLabel(
        "https://nexwork.atlassian.net/wiki/spaces/IESNG/pages/3908075860/Dateiablage+Organisation+Speicherort",
      ),
    ).toBe("Dateiablage Organisation Speicherort");
  });

  it("decodes percent-escaped non-ASCII titles", () => {
    expect(
      adfSmartLinkLabel(
        "https://site.atlassian.net/wiki/spaces/OPS/pages/42/Daten%C3%BCbertragung+Prozess",
      ),
    ).toBe("Datenübertragung Prozess");
  });

  it("strips a trailing slash before matching the page pattern", () => {
    expect(adfSmartLinkLabel("https://site.atlassian.net/wiki/spaces/OPS/pages/42/Runbook/")).toBe(
      "Runbook",
    );
  });

  it("falls back to host + last segment for a Confluence space home", () => {
    expect(adfSmartLinkLabel("https://site.atlassian.net/wiki/spaces/IESNG/")).toBe(
      "site.atlassian.net/IESNG",
    );
  });

  it("falls back to host + last segment for an attachment link", () => {
    expect(
      adfSmartLinkLabel(
        "https://site.atlassian.net/wiki/download/attachments/123456/screenshot.png",
      ),
    ).toBe("site.atlassian.net/screenshot.png");
  });

  it("falls back to the bare host with no path", () => {
    expect(adfSmartLinkLabel("https://example.com")).toBe("example.com");
  });

  it("falls back to the bare host for a query-string-only URL", () => {
    expect(adfSmartLinkLabel("https://example.com?ref=email")).toBe("example.com");
  });

  it("leaves an already-short URL alone", () => {
    expect(adfSmartLinkLabel("https://example.com/spec")).toBe("example.com/spec");
  });

  it("never throws on a string `new URL` cannot parse", () => {
    expect(adfSmartLinkLabel("not a url at all")).toBe("not a url at all");
    expect(adfSmartLinkLabel("http://")).toBe("http://");
  });

  it("does not throw on a malformed percent-escape in the title segment", () => {
    expect(
      adfSmartLinkLabel("https://site.atlassian.net/wiki/spaces/OPS/pages/42/Broken%Title"),
    ).toBe("Broken%Title");
  });
});
