// Rehydrate test fixture (GHE #332): parks on the built-in Tier A `scm.change-request.merged`
// signal, then on `scm.change-request.closed`, then completes. The rehydrate watching tests
// launch it through a throwaway uptime (the run ends up in status `watching` on the merged
// signal), then rehydrate and drain a boot-gap inbox entry to wake it onto the second park.
import { Schema } from "effect";
import {
  getArgs,
  getSignalSource,
  ScmChangeRequestClosed,
  ScmChangeRequestMerged,
  ScmChangeRequestWatch,
} from "@t3team/sdk";

export const Inputs = Schema.Struct({ key: Schema.String });

export const Outputs = Schema.Struct({ mergedTitle: Schema.String, closedTitle: Schema.String });

export const meta = {
  name: "rehydrate-signal-park",
  description: "Parks on two change-request signals, then completes.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["source:scm.change-request.watch"],
} as const;

export default async function run() {
  const args = Schema.decodeSync(Inputs)(getArgs());

  const cr = await getSignalSource(ScmChangeRequestWatch, {
    projectId: "p1",
    repository: "owner/repo",
    number: 42,
  });

  const merged = await cr.waitFor(ScmChangeRequestMerged, { key: args.key });
  const closed = await cr.waitFor(ScmChangeRequestClosed, { key: args.key });

  return { mergedTitle: merged.changeRequest.title, closedTitle: closed.changeRequest.title };
}
