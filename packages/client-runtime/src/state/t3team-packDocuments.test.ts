import { EnvironmentId, type T3TeamPackDocument } from "@t3tools/contracts";
import * as Layer from "effect/Layer";
import { Atom } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  applyT3TeamPackDocumentsEvent,
  createT3TeamPackDocumentsAtoms,
  EMPTY_T3TEAM_PACK_DOCUMENTS,
  supportsT3TeamPackDocuments,
} from "./t3team-packDocuments.ts";

const scope = { packId: "example-pack", collection: "notes" };
const document = (key: string, version = 1): T3TeamPackDocument => ({
  key,
  version,
  doc: { content: `${key}:${version}` },
  updatedAt: "2026-10-07T10:00:00.000Z",
});

describe("applyT3TeamPackDocumentsEvent", () => {
  it("sorts a complete snapshot by key and replaces stale disconnected state", () => {
    const state = applyT3TeamPackDocumentsEvent([document("removed-while-disconnected")], {
      type: "snapshot",
      ...scope,
      documents: [document("notes:z"), document("notes:a")],
    });
    expect(state.map(({ key }) => key)).toEqual(["notes:a", "notes:z"]);
  });

  it("keeps the newer snapshot when an older queued change arrives", () => {
    const state = applyT3TeamPackDocumentsEvent(EMPTY_T3TEAM_PACK_DOCUMENTS, {
      type: "snapshot",
      ...scope,
      documents: [document("notes:a", 4)],
    });
    for (const version of [3, 4]) {
      expect(
        applyT3TeamPackDocumentsEvent(state, {
          type: "upsert",
          ...scope,
          doc: document("notes:a", version),
        }),
      ).toBe(state);
    }
    const updated = applyT3TeamPackDocumentsEvent(state, {
      type: "upsert",
      ...scope,
      doc: document("notes:a", 5),
    });
    expect(updated).toEqual([document("notes:a", 5)]);
  });

  it("adds, replaces and removes only the changed document", () => {
    const original = document("notes:b");
    const inserted = applyT3TeamPackDocumentsEvent([original], {
      type: "upsert",
      ...scope,
      doc: document("notes:a"),
    });
    expect(inserted).toEqual([document("notes:a"), original]);
    expect(inserted[1]).toBe(original);
    const removed = applyT3TeamPackDocumentsEvent(inserted, {
      type: "removed",
      ...scope,
      key: "notes:a",
    });
    expect(removed).toEqual([original]);
    expect(
      applyT3TeamPackDocumentsEvent(removed, {
        type: "removed",
        ...scope,
        key: "missing",
      }),
    ).toBe(removed);
  });
});

describe("supportsT3TeamPackDocuments", () => {
  it("only subscribes when the server advertises packStore", () => {
    expect(supportsT3TeamPackDocuments(undefined)).toBe(false);
    expect(supportsT3TeamPackDocuments({ threadArtifacts: true })).toBe(false);
    expect(supportsT3TeamPackDocuments({ packStore: false })).toBe(false);
    expect(supportsT3TeamPackDocuments({ packStore: true })).toBe(true);
  });
});

describe("createT3TeamPackDocumentsAtoms", () => {
  it("shares one subscription regardless of property order and separates scope and selectors", () => {
    // These unmounted atoms only exercise cache identity; no environment services run.
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<EnvironmentRegistry>;
    const { documents } = createT3TeamPackDocumentsAtoms(runtime);
    const environmentId = EnvironmentId.make("environment-a");
    const target = { environmentId, input: { ...scope, prefix: "notes:" } };
    const original = documents(target);
    expect(documents({ environmentId, input: { prefix: "notes:", ...scope } })).toBe(original);
    for (const other of [
      { ...target, environmentId: EnvironmentId.make("environment-b") },
      { ...target, input: { ...target.input, packId: "other-pack" } },
      { ...target, input: { ...target.input, collection: "other-collection" } },
      { ...target, input: { ...scope, prefix: "notes:other" } },
      { ...target, input: { ...scope, key: "notes:a" } },
    ]) {
      expect(documents(other)).not.toBe(original);
    }
  });
});
