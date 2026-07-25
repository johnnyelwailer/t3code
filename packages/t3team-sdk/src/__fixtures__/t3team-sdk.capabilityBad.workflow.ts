// Phase-25.5 static-capability fixture: calls every gated verb while declaring NOTHING.
import { Schema } from "effect";

export const Inputs = Schema.Struct({});

export const meta = {
  name: "fixtures.capability-bad",
  inputs: Inputs,
  description: "askUser / notifyUser / showWidget / scripts.* / waitUntil with no capabilities.",
  capabilities: [],
} as const;

const answer = await thread.askUser("Approve?");
thread.notifyUser("done");
thread.showWidget({ title: "x" });
const prepared = await scripts.prepareWorkspace({ answer });
await waitUntil(now() + 1000);
// Unconditionally-bound primitives must NOT be flagged.
const summary = await agent("summarize");
await workflow(defineWorkflow({ path: "./child.workflow.ts" }), {});

return { answer, prepared, summary };
