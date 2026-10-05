/**
 * Repair for the fork's V2 port tables (ledger id 99).
 *
 * The Migrator runs only ids above the highest recorded one. While the port was
 * being built, id 97 was registered before 86-92 existed, so a database booted on
 * such an intermediate build records 97 and every later build skips 86-92: no
 * facts, artifacts, child-metadata, cutover-ledger or mailbox tables. This re-runs
 * those bodies (and 98's). Each is `CREATE … IF NOT EXISTS`, so on a database that
 * already ran them it changes nothing.
 */
import * as Effect from "effect/Effect";

import ThreadFacts from "./t3team-064_ThreadFacts.ts";
import ThreadArtifacts from "./t3team-065_ThreadArtifacts.ts";
import ChildThreadMetadata from "./t3team-068_ChildThreadMetadata.ts";
import LineageCutover from "./t3team-069_LineageCutover.ts";
import ThreadMailbox from "./t3team-070_ThreadMailbox.ts";
import ThreadSilenceWatches from "./t3team-076_ThreadSilenceWatches.ts";

export default Effect.gen(function* () {
  yield* ThreadFacts;
  yield* ThreadArtifacts;
  yield* ChildThreadMetadata;
  yield* LineageCutover;
  yield* ThreadMailbox;
  yield* ThreadSilenceWatches;
});
