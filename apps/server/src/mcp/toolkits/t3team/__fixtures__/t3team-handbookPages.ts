import type { HandbookSearchDocument } from "../t3team-handbookBm25.ts";

/** Fixture pages shaped like Source/docs + index — no network. */
export const HANDBOOK_FIXTURE_MARKDOWN = {
  "Source/src/pages/index.md": `---
title: NX Developer Handbook
---

# NX Developer Handbook

Welcome to the Nexplore developer handbook.
`,
  "Source/docs/getting-started/overview.md": `---
title: Getting started overview
---

# Getting started

Install the toolchain and connect to GitHub Enterprise.
`,
  "Source/docs/getting-started/authentication.md": `---
title: Authentication
---

# Authentication

Use GH_ENTERPRISE_TOKEN with GH_HOST, or gh auth login for nexplore.ghe.com.
`,
  "Source/docs/platforms/cloud-sessions.md": `---
title: Cloud sessions
---

# Cloud sessions

Cloud sessions launch agents on remote machines through GitHub Actions.
`,
  "Source/docs/platforms/mcp-tools.mdx": `---
title: Host MCP tools
---

# Host MCP tools

The t3-code MCP server exposes nexplore_handbook for company-wide guidelines.
`,
} as const;

export const HANDBOOK_FIXTURE_DOCUMENTS: ReadonlyArray<HandbookSearchDocument> = [
  {
    path: "Source/src/pages/index.md",
    title: "NX Developer Handbook",
    headings: ["NX Developer Handbook"],
    body: "Welcome to the Nexplore developer handbook.",
  },
  {
    path: "Source/docs/getting-started/overview.md",
    title: "Getting started overview",
    headings: ["Getting started"],
    body: "Install the toolchain and connect to GitHub Enterprise.",
  },
  {
    path: "Source/docs/getting-started/authentication.md",
    title: "Authentication",
    headings: ["Authentication"],
    body: "Use GH_ENTERPRISE_TOKEN with GH_HOST, or gh auth login for nexplore.ghe.com.",
  },
  {
    path: "Source/docs/platforms/cloud-sessions.md",
    title: "Cloud sessions",
    headings: ["Cloud sessions"],
    body: "Cloud sessions launch agents on remote machines through GitHub Actions.",
  },
  {
    path: "Source/docs/platforms/mcp-tools.mdx",
    title: "Host MCP tools",
    headings: ["Host MCP tools"],
    body: "The t3-code MCP server exposes nexplore_handbook for company-wide guidelines.",
  },
];
