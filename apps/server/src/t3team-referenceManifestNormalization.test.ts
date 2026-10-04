// @effect-diagnostics preferSchemaOverJson:off - fixtures assert the raw JSON bytes the state migration writes.
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { it } from "@effect/vitest";
import { describe, expect } from "vite-plus/test";
import {
  normalizeReferenceManifestJson,
  readNormalizedReferenceManifest,
} from "./t3team-referenceManifestNormalization.ts";
import { mainRepositoryFromManifestJson } from "./t3team-toolBrokerStartChildContext.ts";

describe("canonical reference manifest normalization", () => {
  it("maps the old fields once and preserves unrelated project data", () => {
    const raw = JSON.stringify({
      metaRepository: {
        localPath: "/repo",
        url: " https://github.com/org/repo ",
        status: "detected",
      },
      linkedRepositories: [{ url: "other" }],
      project: "PROJECT",
    });
    const normalized = normalizeReferenceManifestJson(raw);
    expect(JSON.parse(normalized)).toEqual({
      mainRepository: {
        localPath: "/repo",
        url: "https://github.com/org/repo",
        status: "adopted",
      },
      linkedRepositories: [{ url: "other" }],
      project: "PROJECT",
    });
    expect(normalizeReferenceManifestJson(normalized)).toBe(normalized);
    expect(mainRepositoryFromManifestJson(raw)?.status).toBe("adopted");
  });
  it("leaves canonical manifests authoritative and does not invent invalid records", () => {
    for (const raw of [
      "null",
      "[]",
      "bad",
      JSON.stringify({ metaRepository: { localPath: " " } }),
      JSON.stringify({
        metaRepository: { localPath: "/old" },
        mainRepository: { localPath: "/new" },
      }),
    ]) {
      expect(normalizeReferenceManifestJson(raw)).toBe(raw);
    }
  });

  it.effect("returns the normalized manifest when the persistence write fails", () =>
    Effect.gen(function* () {
      const raw = JSON.stringify({
        metaRepository: { localPath: "/repo", url: " https://github.com/org/repo " },
        project: "PROJECT",
      });
      let writes = 0;
      const fileSystem = FileSystem.makeNoop({
        readFileString: () => Effect.succeed(raw),
        writeFileString: () => {
          writes += 1;
          return Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "writeFileString",
              description: "read-only",
            }),
          );
        },
      });
      const normalized = yield* readNormalizedReferenceManifest(
        fileSystem,
        "/repo/.t3team/references/reference-repositories.json",
      );
      expect(writes).toBe(1);
      expect(JSON.parse(normalized)).toEqual({
        mainRepository: {
          localPath: "/repo",
          url: "https://github.com/org/repo",
          status: "adopted",
        },
        project: "PROJECT",
      });
      expect(mainRepositoryFromManifestJson(normalized)?.localPath).toBe("/repo");
    }),
  );
});
