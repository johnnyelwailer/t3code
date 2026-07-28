// Phase-25.5 static-capability fixture: calls every gated verb while declaring NOTHING.
import { Schema } from "effect";
import {
  agent,
  defineWorkflow,
  getScripts,
  getThread,
  now,
  waitUntil,
  workflow,
} from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const meta = {
  name: "fixtures.capability-bad",
  inputs: Inputs,
  description: "askUser / notifyUser / showWidget / scripts.* / waitUntil with no capabilities.",
  capabilities: [],
} as const;

export default async function run() {
  const thread = getThread();
  const scripts = getScripts();

  const answer = await thread.askUser("Approve?");
  thread.notifyUser("done");
  thread.showWidget({ title: "x", widgetCode: "<p>x</p>" });
  const prepared = await scripts.prepareWorkspace({ answer });
  await waitUntil(now() + 1000);
  // Unconditionally-bound primitives must NOT be flagged.
  const summary = await agent("summarize", { capabilities: "inherit" });
  await workflow(defineWorkflow({ path: "./child.workflow.ts" }), {});

  return { answer, prepared, summary };
}
