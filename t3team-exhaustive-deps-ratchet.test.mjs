import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const LIST_PATH = NodePath.join(repoRoot, "t3team-exhaustive-deps-pending.txt");

function readPending() {
  return NodeFS.readFileSync(LIST_PATH, "utf8")
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

// Frozen ceiling: this number only goes down. When a file is cleaned, remove it
// from the list and lower this constant.
const MAX_PENDING = 51;

describe("t3team exhaustive-deps pending list", () => {
  const pending = readPending();

  it("cannot grow past the frozen ceiling", () => {
    expect(pending.length).toBeLessThanOrEqual(MAX_PENDING);
  });

  it("every listed file still exists (drop stale entries)", () => {
    const missing = pending.filter((file) => !NodeFS.existsSync(NodePath.join(repoRoot, file)));
    expect(missing).toEqual([]);
  });

  it("has no duplicate paths", () => {
    expect(new Set(pending).size).toBe(pending.length);
  });
});
