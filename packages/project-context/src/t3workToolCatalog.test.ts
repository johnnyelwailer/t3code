/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/// <reference types="node" />
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_T3WORK_THREAD_TOOL_IDS,
  listT3workToolCatalogEntries,
  listImplementedT3workToolCatalogEntries,
} from "./t3workToolCatalog.ts";

const CATALOG_DOC_PATH = new URL(
  "../../../specs/epics/21-context-tool-catalog.md",
  import.meta.url,
);

function readDocumentedToolIds(): ReadonlyArray<string> {
  const doc = NodeFS.readFileSync(CATALOG_DOC_PATH, "utf8");
  const blocks = [...doc.matchAll(/```text\n([\s\S]*?)```/g)];
  const ids = blocks.flatMap((block) => {
    const text = block[1];
    if (!text) {
      return [];
    }
    return [...text.matchAll(/t3work\.[a-z0-9_.]+/g)].map((match) => match[0]);
  });
  return [...new Set(ids)].toSorted();
}

describe("t3workToolCatalog", () => {
  it("lists the implemented tools in catalog order", () => {
    expect(listImplementedT3workToolCatalogEntries().map((tool) => tool.id)).toEqual([
      "t3work.backlog.set_assignee_filter",
      "t3work.backlog.item.assignee.draft_update",
      "t3work.backlog.item.estimate.draft_update",
      "t3work.backlog.item.subtask.draft_create",
      "t3work.work_item.assignee.draft_update",
      "t3work.work_item.estimate.draft_update",
      "t3work.work_item.status.draft_update",
      "t3work.work_item.description.draft_update",
      "t3work.work_item.comment.draft_create",
      "t3work.view.read",
      "t3work.thread.rename",
      "t3work.thread.start_child",
      "t3work.work_item.refresh_context_bundle",
      "t3work.project.refresh_context_bundle",
    ]);
  });

  it("defaults thread tool selection from the catalog", () => {
    expect(DEFAULT_T3WORK_THREAD_TOOL_IDS).toEqual([
      "t3work.view.read",
      "t3work.thread.rename",
      "t3work.thread.start_child",
      "t3work.work_item.refresh_context_bundle",
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

  it("documents every catalog tool id in the design doc", () => {
    const docIds = new Set(readDocumentedToolIds());
    const undocumented = listT3workToolCatalogEntries()
      .map((tool) => tool.id)
      .filter((id) => !docIds.has(id));
    expect(undocumented).toEqual([]);
  });
});
