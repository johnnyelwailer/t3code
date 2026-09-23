// Signal-source fixture (live drain + in-run key dedup): the broker answers every
// `signal.wait` synchronously (the host's live-drain path), so the run never suspends.
// Awaiting the SAME `(signal, key)` twice must journal ONE `signal.wait` handle — the second
// await reuses the first correlation's reply.
import { Schema } from "effect";
import {
  getArgs,
  getSignalSource,
  ScmChangeRequestMerged,
  ScmChangeRequestWatch,
} from "@t3team/sdk";

export const Inputs = Schema.Struct({ key: Schema.String });

export const Outputs = Schema.Struct({ title: Schema.String, mergedBy: Schema.String });

export const meta = {
  name: "fixtures.signal-key-dedupe",
  description: "Awaits one (signal, key) twice without suspending.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["source:scm.change-request.watch"],
} as const;

export default async function run() {
  const args = getArgs();
  const input = Schema.decodeSync(Inputs)(args);

  const cr = await getSignalSource(ScmChangeRequestWatch, {
    projectId: "p1",
    repository: "owner/repo",
    number: 42,
  });

  const first = await cr.waitFor(ScmChangeRequestMerged, { key: input.key });
  const second = await cr.waitFor(ScmChangeRequestMerged, { key: input.key });

  return {
    title: `${first.changeRequest.title}|${second.changeRequest.title}`,
    mergedBy: first.mergedBy ?? "unknown",
  };
}
