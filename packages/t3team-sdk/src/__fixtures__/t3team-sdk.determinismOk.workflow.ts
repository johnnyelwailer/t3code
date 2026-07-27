// Phase-25.5 static-audit fixture: the AMBIENT nondeterminism Epic 25 rule 1 allows
// (journaled Date / Math.random / crypto.randomUUID) plus a body-local `let`. Must be CLEAN.
import * as Schema from "effect/Schema";
import { workflow } from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const meta = {
  name: "fixtures.determinism-ok",
  inputs: Inputs,
  description: "Ambient nondeterminism is journaled, not banned.",
} as const;

export default async function run() {
  let tally = 0;
  tally += Date.now();
  tally += new Date().getTime();
  tally += Math.random();
  const id = crypto.randomUUID();
  // A string and a comment that merely MENTION setTimeout and process.env must not be flagged.
  const note = "avoid setTimeout and process.env in workflow bodies";

  return { tally, id, note };
}
