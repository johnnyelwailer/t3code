import { afterEach, describe, expect, it } from "vite-plus/test";

import { replaceFeatureFlagDatabaseValues } from "@t3tools/project-context/t3teamFeatureFlags";

import {
  isGheRepositoryCatalogEnabled,
  usesAuthenticatedRepositoryList,
} from "./t3team-gheRepositoryCatalogFlag.ts";

const noEnv = () => undefined;
const envOff = (key: string) => (key === "NEXI_FF_GHE_REPOSITORY_CATALOG" ? "0" : undefined);

describe("isGheRepositoryCatalogEnabled", () => {
  afterEach(() => {
    replaceFeatureFlagDatabaseValues(new Map());
  });

  it("defaults on, honours env over the DB, and honours the DB when env is unset", () => {
    expect(isGheRepositoryCatalogEnabled(noEnv)).toBe(true);
    replaceFeatureFlagDatabaseValues(new Map([["GHE_REPOSITORY_CATALOG", false]]));
    expect(isGheRepositoryCatalogEnabled(noEnv)).toBe(false);
    expect(
      isGheRepositoryCatalogEnabled((key) =>
        key === "NEXI_FF_GHE_REPOSITORY_CATALOG" ? "1" : undefined,
      ),
    ).toBe(true);
  });
});

describe("usesAuthenticatedRepositoryList", () => {
  it("gives GHE the full list in repository mode, like github.com", () => {
    expect(
      usesAuthenticatedRepositoryList({ host: "nexplore.ghe.com", repositoriesOnly: true }, noEnv),
    ).toBe(true);
    expect(
      usesAuthenticatedRepositoryList({ host: "GitHub.com", repositoriesOnly: true }, noEnv),
    ).toBe(true);
  });

  it("returns GHE to the title search when the flag is off, and never changes github.com", () => {
    expect(
      usesAuthenticatedRepositoryList({ host: "nexplore.ghe.com", repositoriesOnly: true }, envOff),
    ).toBe(false);
    expect(
      usesAuthenticatedRepositoryList({ host: "github.com", repositoriesOnly: true }, envOff),
    ).toBe(true);
  });

  it("always lists in the inbox mode", () => {
    expect(
      usesAuthenticatedRepositoryList(
        { host: "nexplore.ghe.com", repositoriesOnly: false },
        envOff,
      ),
    ).toBe(true);
  });
});
