// A workflow that CATCHES a refused child and keeps going. The refusal must be observable by the
// body (so an author can decide what to do about it), and it must not poison the run: the NEXT
// agent in the same workflow still gets created and asked.
import { agent, log } from "@t3team/sdk";

export const meta = {
  name: "test.child-refusal-caught",
  description: "Catches a refused child, reports it, then runs a second agent.",
} as const;

export default async function run() {
  let refusal = "";
  try {
    await agent("Review the risk", { label: "Risk review", capabilities: "inherit" });
  } catch (error) {
    refusal = error instanceof Error ? error.message : String(error);
  }
  log(`child refused: ${refusal}`);

  const answer = await agent("Summarise the mitigation", {
    label: "Mitigation summary",
    capabilities: "inherit",
  });
  return { refusal, answer };
}
