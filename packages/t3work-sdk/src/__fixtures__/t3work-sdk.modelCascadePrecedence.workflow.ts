// Precedence fixture: an ask that names BOTH an explicit `model` and a `models` ladder. The
// explicit single model WINS — the ladder is a fallback, not an override — so no `model.resolve`
// primitive is fired and the registry is never probed.
import { Schema } from "effect";

export const Outputs = Schema.Struct({ verdict: Schema.String });

export const meta = {
  name: "fixtures.model-cascade-precedence",
  description: "An ask with both an explicit model and a fallback ladder.",
  outputs: Outputs,
} as const;

const verdict = await agent("judge this gate", {
  label: "Judge gate",
  model: { provider: "pinned", model: { kind: "model", id: "pinned-a", provider: "pinned" } },
  models: [{ instanceId: "nexplore", model: "minimax-m2.7" }],
});

return { verdict };
