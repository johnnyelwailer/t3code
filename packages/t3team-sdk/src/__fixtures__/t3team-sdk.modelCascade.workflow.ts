// Model-cascade fixture: one `agent()` whose provider is chosen from a ladder rather than named.
// The host resolves the ladder against its live registry via ONE journaled `model.resolve`
// primitive (seq 1), then thread.create (seq 2) and thread.turn (seq 3) carry the winning
// selection. On resume the recorded choice replays — the registry is never re-probed.
import { Schema } from "effect";

export const Outputs = Schema.Struct({ verdict: Schema.String });

export const meta = {
  name: "fixtures.model-cascade",
  description: "One agent() call whose provider comes from a fallback ladder.",
  outputs: Outputs,
} as const;

const verdict = await agent("judge this gate", {
  label: "Judge gate",
  models: [{ instanceId: "nexplore", model: "minimax-m2.7" }, { instanceId: "claudeAgent" }],
});

return { verdict };
