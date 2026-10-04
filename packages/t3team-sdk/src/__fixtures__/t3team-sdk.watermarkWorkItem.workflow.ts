// Watermark fixture (bounded execution + signal sources): consume `updates` work-item updates
// from the built-in `work-item.updates` source, advancing a durable cursor after each one. Every
// advance is a checkpoint boundary, so a resume re-drives from the latest cursor instead of from
// seq 0 — the loop reads strictly after it. The binding is re-issued at the top of each
// iteration so the re-driven body's first journaled call after a boundary is the same one the
// original run made there.
import { Schema } from "effect";
import { getArgs, getSignalSource, watermark, WorkItemUpdated, WorkItemUpdates } from "@t3team/sdk";

export const Inputs = Schema.Struct({ updates: Schema.Number });

const decodeInputs = Schema.decodeSync(Inputs);

export const Outputs = Schema.Struct({ revision: Schema.Number, updatedAt: Schema.String });

export const meta = {
  name: "fixtures.watermark-work-item",
  description: "Consumes work-item updates behind a durable watermark cursor.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["source:work-item.updates"],
} as const;

export default async function run() {
  const { updates } = decodeInputs(getArgs());
  const cursor = watermark<{ readonly revision: number; readonly updatedAt: string }>(
    "work-item.updates",
    { initial: { revision: 0, updatedAt: "" }, retention: { history: 2 } },
  );

  while ((cursor.current()?.revision ?? 0) < updates) {
    const source = await getSignalSource(WorkItemUpdates, { projectId: "p1", issueKey: "ABC-1" });
    const update = await source.waitFor(WorkItemUpdated, { key: "ABC-1" });
    const revision = (cursor.current()?.revision ?? 0) + 1;
    await cursor.advance({ revision, updatedAt: update.updatedAt ?? "" });
  }

  return cursor.current() ?? { revision: 0, updatedAt: "" };
}
