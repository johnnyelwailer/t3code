import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";
import { inspectRun } from "@runbook/core/status";

import type * as HistoryResume from "./__fixtures__/t3team-sdk.historyResume.workflow.ts";
import {
  defineWorkflow,
  FsJournalStore,
  resumeWorkflow,
  startWorkflow,
} from "./t3team-sdk.index.ts";

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-history-resume-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const workflow = defineWorkflow<typeof HistoryResume>(
  "./__fixtures__/t3team-sdk.historyResume.workflow.ts",
);

describe("SDK checkpoint history crash-resume", () => {
  it("carries pre-crash history through the real workflow runner", async () => {
    const options = { runsRoot, tools: [], runId: "history-resume" } as const;
    await expect(startWorkflow(workflow, { total: 4, crash: true }, options)).rejects.toThrow(
      "simulated crash",
    );
    const store = new FsJournalStore(runsRoot);
    const afterCrash = await inspectRun(store, "history-resume");
    expect(afterCrash.history?.map((entry) => entry.state)).toEqual([{ i: 1 }, { i: 2 }]);

    const result = await resumeWorkflow(
      "history-resume",
      workflow,
      { total: 4, crash: true },
      {
        runsRoot,
        tools: [],
      },
    );
    expect(result).toMatchObject({ result: { i: 4 } });
    const afterResume = await inspectRun(store, "history-resume");
    expect(afterResume.history?.map((entry) => entry.state)).toEqual([
      { i: 2 },
      { i: 3 },
      { i: 4 },
    ]);
  });
});
