/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/// <reference types="node" />
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_T3TEAM_THREAD_TOOL_IDS,
  listT3TeamToolCatalogEntries,
  listImplementedT3TeamToolCatalogEntries,
} from "./t3teamToolCatalog.ts";

const CATALOG_DOC_PATH = new URL(
  "../../../docs/t3team-mvp/21-context-tool-catalog.md",
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
    return [...text.matchAll(/t3team\.[a-z0-9_.]+/g)].map((match) => match[0]);
  });
  return [...new Set(ids)].toSorted();
}

describe("t3teamToolCatalog", () => {
  it("lists the implemented tools in catalog order", () => {
    expect(listImplementedT3TeamToolCatalogEntries().map((tool) => tool.id)).toEqual([
      "t3team.widget.show",
      "t3team.backlog.set_assignee_filter",
      "t3team.view.read",
      "t3team.recipe.list",
      "t3team.recipe.validate",
      "t3team.orchestration.run",
      "t3team.thread.rename",
      "t3team.thread.search_source",
      "t3team.thread.read_message",
      "t3team.thread.start_child",
      "t3team.thread.children",
      "t3team.work_item.refresh_context_bundle",
      "t3team.project.refresh_context_bundle",
      "t3team.backlog.item.assignee.draft_update",
      "t3team.backlog.item.estimate.draft_update",
      "t3team.backlog.item.subtask.draft_create",
      "t3team.work_item.assignee.draft_update",
      "t3team.work_item.estimate.draft_update",
      "t3team.work_item.status.draft_update",
      "t3team.work_item.description.draft_update",
      "t3team.work_item.comment.draft_create",
      "t3team.work_item.subtask.draft_create",
      "t3team.work_item.link.draft_create",
      "t3team.work_item.link.draft_remove",
    ]);
  });

  it("defaults thread tool selection from the catalog", () => {
    expect(DEFAULT_T3TEAM_THREAD_TOOL_IDS).toEqual([
      "t3team.widget.show",
      "t3team.view.read",
      "t3team.recipe.list",
      "t3team.recipe.validate",
      "t3team.orchestration.run",
      "t3team.thread.rename",
      "t3team.thread.search_source",
      "t3team.thread.read_message",
      "t3team.thread.start_child",
      "t3team.thread.children",
      "t3team.work_item.refresh_context_bundle",
    ]);
  });

  it("keeps documented planned tools in the catalog without enabling them by default", () => {
    expect(listT3TeamToolCatalogEntries({ surface: "backlog" }).map((tool) => tool.id)).toContain(
      "t3team.backlog.list_visible_items",
    );
    expect(listImplementedT3TeamToolCatalogEntries().map((tool) => tool.id)).not.toContain(
      "t3team.backlog.list_visible_items",
    );
  });

  it("documents every catalog tool id in the design doc", () => {
    const docIds = new Set(readDocumentedToolIds());
    const undocumented = listT3TeamToolCatalogEntries()
      .map((tool) => tool.id)
      .filter((id) => !docIds.has(id));
    expect(undocumented).toEqual([]);
  });
});
