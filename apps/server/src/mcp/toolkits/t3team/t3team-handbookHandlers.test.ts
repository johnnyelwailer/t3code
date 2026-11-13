import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { Tool } from "effect/ai";

import * as McpToolAccess from "../../McpToolAccess.ts";
import { HandbookDocs } from "./t3team-handbookDocs.ts";
import * as HandbookHandlers from "./t3team-handbookHandlers.ts";
import {
  HANDBOOK_TOOL_NAME,
  HANDBOOK_TOOL_TITLE,
  HandbookToolkit,
} from "./t3team-handbookTools.ts";

const docsLayer = Layer.mock(HandbookDocs)({
  search: (_query, _limit) =>
    Effect.succeed([
      {
        title: "Host MCP tools",
        path: "Source/docs/platforms/mcp-tools.mdx",
        url: "https://docs.nexplore.dev/platforms/mcp-tools",
        score: 12.5,
      },
    ]),
  getPage: (path) =>
    Effect.succeed({
      title: "Host MCP tools",
      path: "Source/docs/platforms/mcp-tools.mdx",
      url: "https://docs.nexplore.dev/platforms/mcp-tools",
      markdown: `# ${path}\n`,
    }),
});

it("advertises Nexplore Handbook title and description", () => {
  const tool = HandbookToolkit.tools[HANDBOOK_TOOL_NAME];
  expect(tool.name).toBe("nexplore_handbook");
  expect(Option.getOrNull(Context.getOption(tool.annotations, Tool.Title))).toBe(
    HANDBOOK_TOOL_TITLE,
  );
  expect(Context.get(tool.annotations, Tool.Readonly)).toBe(true);
  const description = Tool.getDescription(tool) ?? "";
  expect(description).toMatch(/^Look up Nexplore's guidelines/);
  expect(description).toContain("Nexplore Developer Handbook");
  expect(description).toContain("company-wide");
  expect(description).toContain("not repository-specific");
});

it.effect("searches and loads pages through the single handbook tool", () =>
  Effect.gen(function* () {
    const toolkit = yield* HandbookToolkit.pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(HandbookHandlers.layer).pipe(Layer.provide(docsLayer)),
      ),
    );
    const searched = yield* toolkit
      .handle("nexplore_handbook", { operation: "search", query: "mcp tools", limit: 2 })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(docsLayer));
    expect(searched.at(-1)?.result).toMatchObject({
      results: [
        {
          title: "Host MCP tools",
          path: "Source/docs/platforms/mcp-tools.mdx",
          url: "https://docs.nexplore.dev/platforms/mcp-tools",
        },
      ],
    });
    const page = yield* toolkit
      .handle("nexplore_handbook", { operation: "get_page", path: "platforms/mcp-tools" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(docsLayer));
    expect(page.at(-1)?.result).toMatchObject({
      title: "Host MCP tools",
      markdown: expect.stringContaining("platforms/mcp-tools"),
    });
  }),
);

it.effect("rejects search without query and get_page without path", () =>
  Effect.gen(function* () {
    const toolkit = yield* HandbookToolkit.pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(HandbookHandlers.layer).pipe(Layer.provide(docsLayer)),
      ),
    );
    const missingQuery = yield* toolkit
      .handle("nexplore_handbook", { operation: "search" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(docsLayer));
    expect(missingQuery.at(-1)?.result).toMatchObject({
      _tag: "OrchestratorMcpFailure",
      message: "nexplore_handbook search requires `query`.",
    });
    const missingPath = yield* toolkit
      .handle("nexplore_handbook", { operation: "get_page" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(docsLayer));
    expect(missingPath.at(-1)?.result).toMatchObject({
      _tag: "OrchestratorMcpFailure",
      message: "nexplore_handbook get_page requires `path`.",
    });
  }),
);
