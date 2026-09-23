// Retry fixture: each attempt runs a sub-workflow inline and rejects the first result, proving
// `retry` composes with `workflow()` (the child journals into the same run sequence).
import type * as Child from "./t3team-sdk.subChild.workflow.ts";
import { Schema } from "effect";
import { defineWorkflow, retry, workflow } from "@t3team/sdk";

export const Outputs = Schema.Struct({ attempt: Schema.Number, greeting: Schema.String });

export const meta = {
  name: "fixtures.retry-sub-workflow",
  description: "Retries a sub-workflow invocation once.",
  outputs: Outputs,
  // The child declares ["script"], which must be a subset of the parent's capabilities.
  capabilities: ["schedule", "script"],
} as const;

export default async function run() {
  const child = defineWorkflow<typeof Child>("./t3team-sdk.subChild.workflow.ts");
  return await retry(
    async (attempt) => {
      const sub = await workflow(child, { name: `try-${attempt}` });
      if (attempt < 2) throw new Error("first greeting rejected");
      return { attempt, greeting: sub.greeting };
    },
    { maxAttempts: 2, backoff: () => 1_000 },
  );
}
