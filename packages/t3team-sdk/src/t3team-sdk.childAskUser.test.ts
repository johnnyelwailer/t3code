import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import type * as ChildAskUserWorkflow from "./__fixtures__/t3team-sdk.childAskUser.workflow.ts";
import {
  createMockBroker,
  defineWorkflow,
  startWorkflow,
  type MockBrokerOutcome,
} from "./t3team-sdk.index.ts";

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-child-ask-user-"));
const workflow = defineWorkflow<typeof ChildAskUserWorkflow>(
  "./__fixtures__/t3team-sdk.childAskUser.workflow.ts",
);
const alwaysDefer = (): MockBrokerOutcome => ({ kind: "defer" });

afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

describe("spawned child askUser", () => {
  it("routes user input to the launch thread", async () => {
    const broker = createMockBroker(alwaysDefer);
    const run = await startWorkflow(
      workflow,
      {},
      {
        runsRoot,
        tools: [],
        broker,
        launchThreadId: "launch-thread",
      },
    );

    expect(run).toHaveProperty("suspended", true);
    expect(broker.sent.map((event) => event.kind)).toEqual(["thread.create", "user.input"]);
    expect(broker.sent[1]?.payload).toMatchObject({
      threadId: "launch-thread",
    });
    expect((broker.sent[1]!.payload as { question: string }).question).toContain(
      "Approve child work?",
    );
  });
});
