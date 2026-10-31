import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  T3TEAM_VIEW_CONTEXT_MAX_ITEM_IDS,
  T3TeamThreadViewContextPublication,
  T3TeamViewContext,
} from "./t3team-viewContext.ts";

const decode = Schema.decodeUnknownSync(T3TeamViewContext);

const context = {
  version: 1,
  surface: "my-work",
  projectId: "project-1",
  selection: { kind: "work-item", id: "ACME-1" },
  filters: { query: "login", statusCategory: "all", excludedTypeKeys: ["epic"], lens: "digest" },
  visibleItemIds: ["ACME-1", "ACME-2"],
  visibleItemCount: 2,
};

describe("T3TeamViewContext", () => {
  it("decodes a published my-work view and a cleared publication", () => {
    expect(decode(context).visibleItemIds).toHaveLength(2);
    const publication = Schema.decodeUnknownSync(T3TeamThreadViewContextPublication);
    expect(publication({ threadId: "thread-1", viewContext: context }).viewContext?.surface).toBe(
      "my-work",
    );
    expect(publication({ threadId: "thread-1", viewContext: null }).viewContext).toBeNull();
  });

  it("rejects an unknown surface, version, selection kind, filter value and an oversized id list", () => {
    expect(() => decode({ ...context, surface: "thread" })).toThrow();
    expect(() => decode({ ...context, version: 2 })).toThrow();
    expect(() => decode({ ...context, selection: { kind: "pull-request", id: "1" } })).toThrow();
    expect(() => decode({ ...context, filters: { query: { nested: true } } })).toThrow();
    const ids = Array.from({ length: T3TEAM_VIEW_CONTEXT_MAX_ITEM_IDS + 1 }, (_, i) => `id-${i}`);
    expect(() => decode({ ...context, visibleItemIds: ids })).toThrow();
  });
});
