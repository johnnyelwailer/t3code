import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import {
  HANDBOOK_DEFAULT_SEARCH_LIMIT,
  HANDBOOK_DOCS_BASE_URL,
  HANDBOOK_MAX_SEARCH_LIMIT,
} from "./t3team-handbookConfig.ts";
import { HandbookDocs } from "./t3team-handbookDocs.ts";

export const HANDBOOK_TOOL_NAME = "nexplore_handbook";
export const HANDBOOK_TOOL_TITLE = "Nexplore Handbook";

const HandbookHit = Schema.Struct({
  title: Schema.String,
  path: Schema.String,
  url: Schema.String,
  score: Schema.Number,
});

const HandbookTool = Tool.make(HANDBOOK_TOOL_NAME, {
  description: `Look up Nexplore's guidelines, standards and best practices on any relevant topic (coding conventions, code review, version control, security, architecture, technologies, processes). This is the company-wide Nexplore Developer Handbook (${HANDBOOK_DOCS_BASE_URL}), not repository-specific docs. Use it whenever a task touches how we do things at Nexplore. Operations: search returns ranked pages (title, path, docs URL) for \`query\` (optional \`limit\`); get_page returns markdown for \`path\` (repo path from search, docs URL path, or Source/docs/...).`,
  parameters: Schema.Struct({
    operation: Schema.Literals(["search", "get_page"]).annotate({
      description: "search: find pages; get_page: read one page's markdown.",
    }),
    query: Schema.optional(
      Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "search: terms over title, headings, path, and body.",
      }),
    ),
    limit: Schema.optional(
      Schema.Int.check(
        Schema.isBetween({ minimum: 1, maximum: HANDBOOK_MAX_SEARCH_LIMIT }),
      ).annotate({
        description: `search: max results (default ${HANDBOOK_DEFAULT_SEARCH_LIMIT}, max ${HANDBOOK_MAX_SEARCH_LIMIT}).`,
      }),
    ),
    path: Schema.optional(
      Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "get_page: handbook path, docs URL path, or Source/docs/... file.",
      }),
    ),
  }),
  success: Schema.Union([
    Schema.Struct({ results: Schema.Array(HandbookHit) }),
    Schema.Struct({
      title: Schema.String,
      path: Schema.String,
      url: Schema.String,
      markdown: Schema.String,
    }),
  ]),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [HandbookDocs],
})
  .annotate(Tool.Title, HANDBOOK_TOOL_TITLE)
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const HandbookToolkit = Toolkit.make(HandbookTool);

export const HANDBOOK_MCP_INSTRUCTIONS = `Also provides ${HANDBOOK_TOOL_TITLE} (\`${HANDBOOK_TOOL_NAME}\`) for company-wide Nexplore guidelines and best practices.`;
