import { describe, expect, it } from "vite-plus/test";
import { normalizeReferenceManifestJson } from "./t3team-referenceManifestNormalization.ts";
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
});
