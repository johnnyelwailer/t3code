// Signal-source fixture (capability gate): identical to the two-waits body but WITHOUT the
// `source:scm.change-request.watch` capability — `getSignalSource` must reject with
// PermissionDeniedError before the broker is touched.
import { Schema } from "effect";
import {
  getArgs,
  getSignalSource,
  ScmChangeRequestMerged,
  ScmChangeRequestWatch,
} from "@t3team/sdk";

export const Inputs = Schema.Struct({ key: Schema.String });

export const Outputs = Schema.Struct({ title: Schema.String });

export const meta = {
  name: "fixtures.signal-no-capability",
  description: "Binds a source without declaring its capability.",
  inputs: Inputs,
  outputs: Outputs,
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
  return { title: merged.changeRequest.title };
}
