import { describe, expect, it } from "vite-plus/test";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { buildSyncSteps, describeSyncProgress } from "./t3team-linkedRepositorySyncSteps";

const A = "https://nexplore.ghe.com/hive/a";
const B = "https://nexplore.ghe.com/hive/b";

const entry = (
  url: string,
  patch: Partial<LinkedRepositorySyncResult>,
): LinkedRepositorySyncResult => ({ url, localPath: "/x", status: "cloned", ...patch });

describe("buildSyncSteps", () => {
  it("marks the current clone active and the rest of the work pending, in order", () => {
    const steps = buildSyncSteps({
      phase: "waiting-for-main",
      urls: [A, B],
      byUrl: new Map([
        [A, entry(A, { status: "cloned" })],
        [B, entry(B, { status: "pending", syncState: "cloning" })],
      ]),
      mainRepositoryUrl: B,
    });
    expect(steps.map((step) => [step.id.split(":")[0], step.state])).toEqual([
      ["save", "done"],
      ["repository", "done"],
      ["repository", "active"],
      ["main", "pending"],
      ["workspace", "pending"],
    ]);
    expect(steps[3]?.detail).toBe("Waiting for its clone to finish");
    expect(describeSyncProgress(steps)).toBe("Step 3 of 5");
  });

  it("counts a repository that is only linked, not cloned, as done once saved", () => {
    const steps = buildSyncSteps({
      phase: "saved",
      urls: [A],
      byUrl: new Map([[A, entry(A, { status: "not-cloned" })]]),
    });
    expect(steps[1]).toMatchObject({ state: "done", detail: "Linked — cloned when needed" });
    expect(describeSyncProgress(steps)).toBeNull();
  });

  it("reports a failed clone with its reason and leaves later steps pending", () => {
    const steps = buildSyncSteps({
      phase: "saved",
      urls: [A],
      byUrl: new Map([[A, entry(A, { status: "failed", error: "rename failed" })]]),
    });
    expect(steps[1]).toMatchObject({ state: "failed", detail: "rename failed" });
    expect(steps.at(-1)).toMatchObject({ id: "workspace", state: "pending" });
  });

  it("is complete once the save finished and every repository is ready", () => {
    const steps = buildSyncSteps({
      phase: "saved",
      urls: [A],
      byUrl: new Map([[A, entry(A, {})]]),
    });
    expect(steps.every((step) => step.state === "done")).toBe(true);
    expect(describeSyncProgress(steps)).toBeNull();
  });
});
