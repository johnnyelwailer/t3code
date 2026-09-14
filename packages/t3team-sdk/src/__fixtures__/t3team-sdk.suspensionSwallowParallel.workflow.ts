// Regression fixture: the SECOND swallow site — `parallel()`'s per-branch rejection handler.
//
// `parallel` documents that a REJECTED thunk resolves to `null`. A suspension is not a rejection,
// but it arrives as one, so the handler used to null it out and the whole composition completed
// with `[null, null]` for asks that never answered. `parallel`/`pipeline` now re-raise it.
//
// Composition branches are a journaling black box, so such a suspension is also UNRESUMABLE (no
// `sent` entry for a host to settle) — the run boundary says so instead of parking forever. A
// host that settles composition asks live inside `broker.send` (t3code's server does) never
// reaches this at all.
import { Schema } from "effect";
import { agent, parallel } from "@t3team/sdk";

export const Inputs = Schema.Struct({});

export const Outputs = Schema.Struct({ replies: Schema.Array(Schema.NullOr(Schema.String)) });

export const meta = {
  name: "fixtures.suspension-swallow-parallel",
  description: "Fans two agent asks out through parallel(), where the host defers both.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: [],
} as const;

export default async function run() {
  const replies = await parallel([
    () => agent("Branch one", { label: "One", capabilities: "inherit" }),
    () => agent("Branch two", { label: "Two", capabilities: "inherit" }),
  ]);
  return { replies };
}
