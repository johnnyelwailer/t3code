// @effect-diagnostics nodeBuiltinImport:off
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_T3WORK_THREAD_TOOL_IDS,
  listT3workToolCatalogEntries,
  listImplementedT3workToolCatalogEntries,
} from "./t3work-toolCatalog.js";

const CATALOG_DOC_PATH = new URL(
  "../../../docs/t3work-mvp/21-context-tool-catalog.md",
  import.meta.url,
);

function readDocumentedToolIds(): ReadonlyArray<string> {
  const doc = readFileSync(CATALOG_DOC_PATH, "utf8");
  return [...new Set([...doc.matchAll(/t3work\.[a-z0-9_.]+/g)].map((match) => match[0]))].toSorted();
}

describe("t3work-toolCatalog", () => {
  it("lists the implemented tools in catalog order", () => {
    expect(listImplementedT3workToolCatalogEntries().map((tool) => tool.id)).toEqual([
      "t3work.view.read",
      "t3work.thread.rename",
      "t3work.thread.start_child",
    ]);
  });

  it("defaults thread tool selection from the catalog", () => {
    expect(DEFAULT_T3WORK_THREAD_TOOL_IDS).toEqual([
      "t3work.view.read",
      "t3work.thread.rename",
      "t3work.thread.start_child",
    ]);
  });

  it("keeps documented planned tools in the catalog without enabling them by default", () => {
    expect(listT3workToolCatalogEntries({ surface: "backlog" }).map((tool) => tool.id)).toContain(
      "t3work.backlog.list_visible_items",
    );
    expect(listImplementedT3workToolCatalogEntries().map((tool) => tool.id)).not.toContain(
      "t3work.backlog.list_visible_items",
    );
  });

  it("matches the design doc tool ids exactly", () => {
    expect(
      listT3workToolCatalogEntries()
        .map((tool) => tool.id)
        .toSorted(),
    ).toEqual(readDocumentedToolIds());
  });
});
