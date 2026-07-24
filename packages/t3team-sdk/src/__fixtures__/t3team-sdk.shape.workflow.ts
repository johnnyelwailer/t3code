// Shape-derivation fixture (play-as-shape view): a body that exercises all four step kinds and
// `phase()` partitioning so `deriveWorkflowShape` has a known descriptor to assert against —
//   • Review: tools.*.get (read) + agent (agent turn),
//   • Decide: thread.askUser (ask) + tools.*.merge (act, inside a branch).
// It is never executed by the shape test; only statically parsed.
import { Schema } from "effect";

export const Inputs = Schema.Struct({ prId: Schema.String });

export const meta = {
  name: "shape.pr-review",
  description: "Summarize a PR, then ask the user whether to merge it.",
  inputs: Inputs,
  capabilities: ["user"],
  phases: [{ title: "Review" }, { title: "Decide" }] as const,
} as const;

const input = Schema.decodeSync(Inputs)(args);

phase("Review");
const pr = await tools.github.pullRequest.get({ id: input.prId });
const review = await agent(`Summarize the risk of: ${pr.title}`, {
  schema: Schema.Struct({ risk: Schema.String }),
});

phase("Decide");
const decision = await thread.askUser(`Merge "${pr.title}"?\n\n${review.risk}`, {
  schema: Schema.Struct({ merge: Schema.Boolean }),
});
if (decision.merge) {
  await tools.github.pullRequest.merge({ id: input.prId });
}

return { merged: decision.merge };
