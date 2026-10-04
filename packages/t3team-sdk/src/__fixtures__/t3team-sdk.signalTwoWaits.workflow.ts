// Signal-source fixture (suspend → resume): bind the built-in Tier A watch source, park on
// `scm.change-request.merged`, then on `scm.change-request.closed`, then complete. The mock
// broker defers every `signal.wait`, so the test plays the reactor's role: appendResolvedEntry
// + resumeWorkflow per parked correlation, exactly like the production delivery path.
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
  name: "fixtures.signal-two-waits",
  description: "Parks on two change-request signals, then completes.",
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

  const merged = await cr.waitFor(ScmChangeRequestMerged, { key: input.key });
  const closed = await cr.waitFor(ScmChangeRequestClosed, { key: input.key });

  return { mergedTitle: merged.changeRequest.title, closedTitle: closed.changeRequest.title };
}
