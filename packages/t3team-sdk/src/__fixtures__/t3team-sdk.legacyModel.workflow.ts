import { Schema } from "effect";
import { agent, defineModel } from "@t3team/sdk";

export const Outputs = Schema.String;

export const meta = {
  name: "fixtures.legacy-model",
  description: "An existing body imports and calls defineModel.",
  outputs: Outputs,
} as const;

export default async function run() {
  return await agent("Review this change", {
    label: "Legacy review",
    capabilities: "inherit",
    model: {
      provider: "primary",
      model: defineModel({ provider: "primary", id: "model-a" }),
    },
    effort: "high",
  });
}
