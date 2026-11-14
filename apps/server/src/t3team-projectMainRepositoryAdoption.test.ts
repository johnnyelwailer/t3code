import { describe, expect, it } from "vite-plus/test";

import { mainRepositoryFromManifestJson } from "./t3team-toolBrokerStartChildContext.ts";

describe("t3team main repository (monorepo-as-metarepo, GHE #42)", () => {
  it("decodes the mainRepository entry from a reference manifest", () => {
    const manifest = JSON.stringify({
      mainRepository: {
        url: "https://github.com/owner/mono",
        localPath: "/tmp/mono",
        status: "adopted",
      },
      linkedRepositories: [],
    });
    expect(mainRepositoryFromManifestJson(manifest)).toEqual({
      url: "https://github.com/owner/mono",
      localPath: "/tmp/mono",
      status: "adopted",
    });
  });

  it("decodes a mainRepository entry without a remote url", () => {
    const manifest = JSON.stringify({
      mainRepository: { localPath: "/tmp/mono", status: "adopted" },
    });
    expect(mainRepositoryFromManifestJson(manifest)).toEqual({
      localPath: "/tmp/mono",
      status: "adopted",
    });
  });

  it("returns undefined for legacy wrapped manifests, malformed json, or empty localPath", () => {
    expect(mainRepositoryFromManifestJson('{"linkedRepositories": []}')).toBeUndefined();
    expect(mainRepositoryFromManifestJson("not json")).toBeUndefined();
    expect(
      mainRepositoryFromManifestJson(
        JSON.stringify({ mainRepository: { localPath: "  ", status: "adopted" } }),
      ),
    ).toBeUndefined();
    expect(
      mainRepositoryFromManifestJson(JSON.stringify({ mainRepository: null })),
    ).toBeUndefined();
  });
});
