import { describe, expect, it } from "@effect/vitest";

import {
  extractHandbookHeadings,
  extractHandbookTitle,
  handbookDocsUrl,
  isHandbookMarkdownPath,
  normalizeHandbookPath,
  stripHandbookFrontmatter,
} from "./t3team-handbookParse.ts";
import { HANDBOOK_FIXTURE_MARKDOWN } from "./__fixtures__/t3team-handbookPages.ts";

describe("handbook path helpers", () => {
  it("accepts docs markdown and the index page only", () => {
    expect(isHandbookMarkdownPath("Source/docs/a.md")).toBe(true);
    expect(isHandbookMarkdownPath("Source/docs/a.mdx")).toBe(true);
    expect(isHandbookMarkdownPath("Source/src/pages/index.md")).toBe(true);
    expect(isHandbookMarkdownPath("Source/docs/image.png")).toBe(false);
    expect(isHandbookMarkdownPath("README.md")).toBe(false);
  });

  it("normalizes pasted docs URLs and short paths", () => {
    expect(normalizeHandbookPath("https://docs.nexplore.dev/")).toBe("Source/src/pages/index.md");
    expect(normalizeHandbookPath("platforms/mcp-tools")).toBe("Source/docs/platforms/mcp-tools.md");
    expect(normalizeHandbookPath("Source/docs/platforms/mcp-tools.mdx")).toBe(
      "Source/docs/platforms/mcp-tools.mdx",
    );
    expect(normalizeHandbookPath("docs/getting-started/overview.md")).toBe(
      "Source/docs/getting-started/overview.md",
    );
  });

  it("maps repo paths to docs.nexplore.dev URLs", () => {
    expect(handbookDocsUrl("Source/src/pages/index.md")).toBe("https://docs.nexplore.dev/");
    expect(handbookDocsUrl("Source/docs/platforms/mcp-tools.mdx")).toBe(
      "https://docs.nexplore.dev/platforms/mcp-tools",
    );
    expect(handbookDocsUrl("Source/docs/getting-started/index.md")).toBe(
      "https://docs.nexplore.dev/getting-started",
    );
  });
});

describe("handbook markdown helpers", () => {
  it("prefers frontmatter title, then first heading", () => {
    expect(
      extractHandbookTitle(
        "Source/docs/platforms/mcp-tools.mdx",
        HANDBOOK_FIXTURE_MARKDOWN["Source/docs/platforms/mcp-tools.mdx"],
      ),
    ).toBe("Host MCP tools");
    expect(extractHandbookTitle("Source/docs/x.md", "# Only heading\n\nBody")).toBe("Only heading");
  });

  it("extracts headings and strips frontmatter", () => {
    const markdown = HANDBOOK_FIXTURE_MARKDOWN["Source/docs/getting-started/authentication.md"];
    expect(extractHandbookHeadings(markdown)).toEqual(["Authentication"]);
    expect(stripHandbookFrontmatter(markdown).trimStart().startsWith("# Authentication")).toBe(
      true,
    );
  });
});
