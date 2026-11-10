import { assert, describe, it } from "@effect/vitest";

import { snapshotOwnerOf } from "./t3team-cloudSessionSnapshotOwner.ts";

const ENTRA = `o${"0f".repeat(16)}`;

describe("snapshotOwnerOf (session.yml 'Resolve the snapshot owner')", () => {
  it("names a run dispatched without the broker after its GitHub actor: g<actor id>", () => {
    assert.equal(
      snapshotOwnerOf({ brokerRun: false, actorId: 1283972, runCacheOwners: [] }),
      "g1283972",
    );
  });

  it("takes the owner the run wrote into its own snapshot keys", () => {
    assert.equal(
      snapshotOwnerOf({ brokerRun: true, actorId: 5, runCacheOwners: [ENTRA, ENTRA] }),
      ENTRA,
    );
    assert.equal(snapshotOwnerOf({ brokerRun: false, actorId: 7, runCacheOwners: ["g7"] }), "g7");
  });

  it("cannot name a broker run's owner without its snapshot keys (the broker names it)", () => {
    assert.isNull(snapshotOwnerOf({ brokerRun: true, actorId: 1283972, runCacheOwners: [] }));
  });

  it("refuses evidence that contradicts the workflow's rule", () => {
    // A non-broker run's keys must carry its own actor; a broker run's an Entra owner.
    assert.isNull(snapshotOwnerOf({ brokerRun: false, actorId: 7, runCacheOwners: ["g8"] }));
    assert.isNull(snapshotOwnerOf({ brokerRun: true, actorId: 7, runCacheOwners: ["g7"] }));
    assert.isNull(snapshotOwnerOf({ brokerRun: false, actorId: 7, runCacheOwners: [ENTRA] }));
    assert.isNull(
      snapshotOwnerOf({
        brokerRun: true,
        actorId: null,
        runCacheOwners: [ENTRA, `o${"1".repeat(32)}`],
      }),
    );
    assert.isNull(snapshotOwnerOf({ brokerRun: false, actorId: null, runCacheOwners: [] }));
    assert.isNull(snapshotOwnerOf({ brokerRun: false, actorId: -1, runCacheOwners: [] }));
  });
});
