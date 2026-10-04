// Retry fixture: each attempt runs a recipe script, then asks a one-shot agent and rejects a bad
// reply, with a durable journaled backoff (`waitUntil`) between attempts. The test's script
// THROWS on attempt 2 — a failed primitive leaves no journal line of its own, which is exactly
// the attempt a resume must never re-drive.
import { Schema } from "effect";
import { agent, getScripts, retry } from "@t3team/sdk";

export const Outputs = Schema.Struct({ attempt: Schema.Number, reply: Schema.String });

export const meta = {
  name: "fixtures.retry-agent",
  description: "Retries a script + agent step until it returns a good reply, backing off durably.",
  outputs: Outputs,
  capabilities: ["schedule", "script"],
} as const;

export default async function run() {
  const scripts = getScripts();
  return await retry(
    async (attempt) => {
      await scripts.probe({ attempt });
      const reply = await agent(`review attempt ${attempt}`, { capabilities: "inherit" });
      if (reply !== "good") throw new Error(`unusable reply: ${reply}`);
      return { attempt, reply };
    },
    { maxAttempts: 3, backoff: (attempt) => attempt * 60_000 },
  );
}
