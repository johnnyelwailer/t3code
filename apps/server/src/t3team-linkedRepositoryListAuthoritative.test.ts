import { describe, expect, it } from "vite-plus/test";

import {
  mergeLinkedRepositoryEntries,
  resolveManifestLinkedRepositories,
} from "./t3team-project-repository-routesBootstrap.ts";
import type { LinkedRepositoryBootstrapResult } from "./t3team-project-repository-utils.ts";

const entry = (url: string, localPath: string): LinkedRepositoryBootstrapResult => ({
  url,
  localPath,
  status: "updated",
});

const OLD = "https://ghe.example.com/old-org/old-repo";
const NEW = "https://ghe.example.com/new-org/new-repo";

describe("linked repository list is authoritative on save", () => {
  it("drops a repository the user removed instead of re-adding it", () => {
    const preserved = [entry(OLD, "/ws/.t3team/references/01-old-repo")];
    const fresh = [entry(NEW, "/ws/.t3team/references/02-new-repo")];
    const result = resolveManifestLinkedRepositories({ preserved, fresh, explicitList: true });
    expect(result.map((item) => item.url)).toEqual([NEW]);
  });

  it("stays removed across repeated saves (restart = re-bootstrap with the saved list)", () => {
    let manifest: ReadonlyArray<LinkedRepositoryBootstrapResult> = [
      entry(OLD, "/a"),
      entry(NEW, "/b"),
    ];
    for (let i = 0; i < 3; i += 1) {
      manifest = resolveManifestLinkedRepositories({
        preserved: manifest,
        fresh: [entry(NEW, "/b")],
        explicitList: true,
      });
    }
    expect(manifest.map((item) => item.url)).toEqual([NEW]);
  });

  it("an empty saved list clears the manifest", () => {
    expect(
      resolveManifestLinkedRepositories({
        preserved: [entry(OLD, "/a")],
        fresh: [],
        explicitList: true,
      }),
    ).toEqual([]);
  });

  it("a recurring bootstrap without a list still keeps earlier entries", () => {
    const preserved = [entry(OLD, "/a")];
    expect(
      resolveManifestLinkedRepositories({ preserved, fresh: [], explicitList: false }),
    ).toEqual(mergeLinkedRepositoryEntries(preserved, []));
  });
});
