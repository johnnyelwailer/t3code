// getConfig through the production broker and host: read the recipe config for one repository,
// park on a user question, then read the same answer back on the resume, whatever the file says.
import { Schema } from "effect";
import { getConfig, getThread } from "@t3team/sdk";

export const meta = {
  name: "fixtures.get-config",
  description: "Reads its recipe config across a suspension.",
  capabilities: ["user"],
} as const;

export default async function run() {
  const config = await getConfig<{ model?: string; autoMerge?: string[] }>().for({
    repository: "hive/nx-nexi",
    caller: { language: "de" },
  });
  const thread = getThread();
  if (thread === undefined) throw new Error("needs a launch thread");
  await thread.askUser("Continue?", { schema: Schema.Struct({ go: Schema.Boolean }) });
  return {
    model: config.values.model ?? null,
    autoMerge: config.values.autoMerge ?? null,
    language: (config.values as { language?: string }).language ?? null,
    modelSource: config.sources.model ?? null,
    warnings: config.warnings.length,
  };
}
