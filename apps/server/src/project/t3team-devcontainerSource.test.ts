import { describe, expect, it } from "@effect/vitest";

import { hashDefinitionFiles, resolveBuildReference } from "./t3team-devcontainerSource.ts";

describe("hashDefinitionFiles", () => {
  it("does not depend on the order the files are listed in, nor on the host locale", () => {
    const z = { path: "z.yml", contents: "z" };
    const umlaut = { path: "ä.yml", contents: "a" };
    // Code-unit order puts "z" (0x7a) before "ä" (0xe4); an en_US collation would not, so a
    // locale-sensitive sort hashes differently on a differently configured machine.
    expect(hashDefinitionFiles([umlaut, z])).toBe(hashDefinitionFiles([z, umlaut]));
    expect(hashDefinitionFiles([z, umlaut])).toMatchInlineSnapshot(
      `"sha256:ee9c93ad617d22648a371e83bccee848439a79921647dc2d9d0c4d2f04080ef6"`,
    );
  });
});

describe("resolveBuildReference", () => {
  it("resolves against the devcontainer's directory, the root included", () => {
    expect(resolveBuildReference(".devcontainer.json", "Dockerfile")).toBe("Dockerfile");
    expect(resolveBuildReference(".devcontainer/devcontainer.json", "Dockerfile")).toBe(
      ".devcontainer/Dockerfile",
    );
    expect(resolveBuildReference(".devcontainer/api/devcontainer.json", "../compose.yml")).toBe(
      ".devcontainer/compose.yml",
    );
  });

  it("refuses absolute references and references that leave the repository", () => {
    for (const reference of ["/Dockerfile", "C:/Dockerfile", "a\\b", "../../Dockerfile"]) {
      expect(resolveBuildReference(".devcontainer/devcontainer.json", reference), reference).toBe(
        null,
      );
    }
  });
});
