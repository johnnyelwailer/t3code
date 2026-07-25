// Determinism fixture: the body mints ids via `crypto.randomUUID()`. Each call is journaled
// (PrimitiveKind "uuid"), so a resume replays the recorded ids rather than minting new ones
// — `id1` and `id2` come back identical to the original run.
import { Schema } from "effect";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({
  id1: Schema.String,
  id2: Schema.String,
});

export const meta = {
  name: "fixtures.journal-uuid",
  description: "Mints crypto.randomUUID() twice; both journal and replay deterministically.",
  inputs: Inputs,
  outputs: Outputs,
} as const;

const id1 = crypto.randomUUID();
const id2 = crypto.randomUUID();

return { id1, id2 };
