// Any-wait fixture (design 42 + bounded execution): the change-request babysitter loop. Each
// iteration re-binds three Tier A sources and parks on the FIRST of four branches. A checks or
// review hit is recorded behind the watermark cursor and loops; a merge or close ends the run.
// `hit.payload.conclusion` / `.reviewer` only compile because `index` narrows the payload.
import { Schema } from "effect";
import {
  getArgs,
  getSignalSource,
  ScmChangeRequestChecks,
  ScmChangeRequestChecksConcluded,
  ScmChangeRequestClosed,
  ScmChangeRequestMerged,
  ScmChangeRequestReview,
  ScmChangeRequestReviewActivity,
  ScmChangeRequestWatch,
  waitForAny,
  watermark,
} from "@t3team/sdk";

export const Inputs = Schema.Struct({ key: Schema.String });

export const Outputs = Schema.Struct({ ended: Schema.String, seen: Schema.Array(Schema.String) });

export const meta = {
  name: "fixtures.signal-wait-any",
  description: "Watches a change request until it merges or closes, recording checks and reviews.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: [
    "source:scm.change-request.watch",
    "source:scm.change-request.checks",
    "source:scm.change-request.review",
  ],
} as const;

const params = { projectId: "p1", repository: "owner/repo", number: 42 };

export default async function run() {
  const { key } = Schema.decodeSync(Inputs)(getArgs());
  const cursor = watermark<{ readonly seen: ReadonlyArray<string> }>("scm.change-request.watch", {
    initial: { seen: [] },
  });

  for (;;) {
    const watch = await getSignalSource(ScmChangeRequestWatch, params);
    const checks = await getSignalSource(ScmChangeRequestChecks, params);
    const review = await getSignalSource(ScmChangeRequestReview, params);
    const hit = await waitForAny([
      watch.on(ScmChangeRequestMerged, { key }),
      watch.on(ScmChangeRequestClosed, { key }),
      checks.on(ScmChangeRequestChecksConcluded, { key }),
      review.on(ScmChangeRequestReviewActivity, { key }),
    ]);
    const seen = cursor.current()?.seen ?? [];
    if (hit.index === 2) {
      await cursor.advance({ seen: [...seen, `checks:${hit.payload.conclusion}`] });
    } else if (hit.index === 3) {
      await cursor.advance({ seen: [...seen, `review:${hit.payload.reviewer}`] });
    } else {
      return { ended: hit.signal, seen: [...seen] };
    }
  }
}
