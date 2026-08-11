import { describe, expect, it } from "vite-plus/test";
import { parseUnifiedDiffToFiles } from "./t3team-github-unified-diff-parser.ts";

describe("parseUnifiedDiffToFiles", () => {
  it("parses a modified file's hunks into GitHub's per-file shape", () => {
    const diff = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 111aaaa..222bbbb 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,2 +1,2 @@",
      " context line",
      "-export const value = 'old';",
      "+export const value = 'new';",
      "",
    ].join("\n");

    const files = parseUnifiedDiffToFiles(diff);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      filename: "src/foo.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      changes: 2,
    });
    expect(files[0]?.patch).toBe(
      "@@ -1,2 +1,2 @@\n context line\n-export const value = 'old';\n+export const value = 'new';",
    );
  });

  it("marks a newly added file", () => {
    const diff = [
      "diff --git a/src/new.ts b/src/new.ts",
      "new file mode 100644",
      "index 0000000..aaaaaaa",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1,1 @@",
      "+export const brandNew = true;",
      "",
    ].join("\n");

    const files = parseUnifiedDiffToFiles(diff);

    expect(files[0]).toMatchObject({
      filename: "src/new.ts",
      status: "added",
      additions: 1,
      deletions: 0,
    });
  });

  it("marks a deleted file", () => {
    const diff = [
      "diff --git a/src/old.ts b/src/old.ts",
      "deleted file mode 100644",
      "index aaaaaaa..0000000",
      "--- a/src/old.ts",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-export const goingAway = true;",
      "",
    ].join("\n");

    const files = parseUnifiedDiffToFiles(diff);

    expect(files[0]).toMatchObject({
      filename: "src/old.ts",
      status: "removed",
      additions: 0,
      deletions: 1,
    });
  });

  it("captures a pure rename with no content change", () => {
    const diff = [
      "diff --git a/src/old-name.ts b/src/new-name.ts",
      "similarity index 100%",
      "rename from src/old-name.ts",
      "rename to src/new-name.ts",
      "",
    ].join("\n");

    const files = parseUnifiedDiffToFiles(diff);

    expect(files[0]).toMatchObject({
      filename: "src/new-name.ts",
      status: "renamed",
      previous_filename: "src/old-name.ts",
      additions: 0,
      deletions: 0,
    });
    expect(files[0]?.patch).toBeUndefined();
  });

  it("captures a rename that also changed content", () => {
    const diff = [
      "diff --git a/src/old-name.ts b/src/new-name.ts",
      "similarity index 87%",
      "rename from src/old-name.ts",
      "rename to src/new-name.ts",
      "index 111aaaa..222bbbb 100644",
      "--- a/src/old-name.ts",
      "+++ b/src/new-name.ts",
      "@@ -1 +1 @@",
      "-export const value = 'old';",
      "+export const value = 'new';",
      "",
    ].join("\n");

    const files = parseUnifiedDiffToFiles(diff);

    expect(files[0]).toMatchObject({
      filename: "src/new-name.ts",
      status: "renamed",
      previous_filename: "src/old-name.ts",
      additions: 1,
      deletions: 1,
    });
    expect(files[0]?.patch).toContain("@@ -1 +1 @@");
  });

  it("marks a binary file with no patch and zero counts", () => {
    const diff = [
      "diff --git a/assets/logo.png b/assets/logo.png",
      "index 111aaaa..222bbbb 100644",
      "Binary files a/assets/logo.png and b/assets/logo.png differ",
      "",
    ].join("\n");

    const files = parseUnifiedDiffToFiles(diff);

    expect(files[0]).toMatchObject({
      filename: "assets/logo.png",
      status: "modified",
      additions: 0,
      deletions: 0,
      changes: 0,
    });
    expect(files[0]?.patch).toBeUndefined();
  });

  it("parses multiple files in one diff, including a rename and a binary file together", () => {
    const diff = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "index 111aaaa..222bbbb 100644",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/src/old-name.ts b/src/new-name.ts",
      "similarity index 100%",
      "rename from src/old-name.ts",
      "rename to src/new-name.ts",
      "diff --git a/assets/logo.png b/assets/logo.png",
      "index 333cccc..444dddd 100644",
      "Binary files a/assets/logo.png and b/assets/logo.png differ",
      "",
    ].join("\n");

    const files = parseUnifiedDiffToFiles(diff);

    expect(files).toHaveLength(3);
    expect(files.map((file) => file.filename)).toEqual([
      "src/foo.ts",
      "src/new-name.ts",
      "assets/logo.png",
    ]);
    expect(files[1]?.status).toBe("renamed");
    expect(files[2]?.patch).toBeUndefined();
  });
});
