/**
 * Static regression guard: per-row sidebar slots must NOT subscribe to
 * `useProjectStore` (directly or through the hooks that wrap it).
 *
 * Why this test exists
 * --------------------
 * Before the fix in `t3team-sidebarThreadDataStore`, `InboxSubRunsChip` called
 * `useT3TeamChildThreadRelations()` and `InboxThreadAttribution` called
 * `useT3TeamInboxAttribution()`.  Both of those hooks call `useProjectStore()`
 * internally.  With ~60 visible thread rows, a single thread click triggered
 * ~120 independent `useProjectStore` subscriptions, causing every row to
 * re-render and every useEffect chain to fire — measured at ~2.4 s per click.
 *
 * The correct pattern is for `Sidebar.tsx` to call `useT3TeamSidebarThreadMeta()`
 * ONCE and mirror the results to `t3team-sidebarThreadDataStore`; the per-row
 * slots read from that store with narrow selectors.
 *
 * This guard runs on every CI pass and prevents the pattern from silently
 * re-appearing during a future refactor or upstream sync.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const INBOX_SLOTS_PATH = path.resolve(import.meta.dirname, "t3team-InboxSlots.tsx");

describe("InboxSlots per-row store subscription regression guard", () => {
  const source = fs.readFileSync(INBOX_SLOTS_PATH, "utf8");

  it("does not import useT3TeamChildThreadRelations (would create per-row useProjectStore subscription)", () => {
    expect(source).not.toContain("useT3TeamChildThreadRelations");
  });

  it("does not import useT3TeamInboxAttribution (would create per-row useProjectStore subscription)", () => {
    expect(source).not.toContain("useT3TeamInboxAttribution");
  });

  it("does not import useProjectStore directly (string in comments is allowed)", () => {
    // Match an actual import statement, not occurrences in JSDoc comments.
    // The file may mention the hook by name in explanatory comments.
    expect(source).not.toMatch(/^import[^;]*useProjectStore/m);
    expect(source).not.toMatch(/const\s+\{[^}]*\}\s*=\s*useProjectStore\s*\(/m);
  });

  it("reads InboxSubRunsChip counts from t3team-sidebarThreadDataStore", () => {
    expect(source).toContain("useT3TeamSidebarThreadDataStore");
  });

  it("reads InboxThreadAttribution data from t3team-sidebarThreadDataStore", () => {
    // Both components read from the same store — one occurrence is enough
    // to confirm the store import is present.
    expect(source).toContain("t3team-sidebarThreadDataStore");
  });
});
