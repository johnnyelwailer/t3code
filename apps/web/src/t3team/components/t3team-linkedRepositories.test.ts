import { describe, expect, it } from "vite-plus/test";

import {
  parseRepositoryLabel,
  parseRepositoryParts,
} from "~/t3team/components/t3team-linkedRepositories";
import { entryFromUrl } from "~/t3team/components/t3team-repositoryPickerEntries";

describe("parseRepositoryLabel", () => {
  it("returns owner/repo for https and ssh remotes, without the host", () => {
    expect(parseRepositoryLabel("https://github.com/acme/alpha")).toBe("acme/alpha");
    expect(parseRepositoryLabel("https://github.com/acme/alpha.git")).toBe("acme/alpha");
    expect(parseRepositoryLabel("git@github.com:acme/alpha.git")).toBe("acme/alpha");
    expect(parseRepositoryLabel("https://nexplore.ghe.com/hive/nx-nexi")).toBe("hive/nx-nexi");
  });
});

describe("parseRepositoryParts", () => {
  it("keeps the host for the picker, separate from the display name", () => {
    expect(parseRepositoryParts("https://github.com/acme/alpha")).toEqual({
      host: "github.com",
      name: "acme/alpha",
    });
    expect(parseRepositoryParts("git@nexplore.ghe.com:hive/nx-nexi.git")).toEqual({
      host: "nexplore.ghe.com",
      name: "hive/nx-nexi",
    });
  });
});

describe("entryFromUrl", () => {
  it("does not treat the host as the owner", () => {
    expect(entryFromUrl("https://github.com/acme/beta")).toEqual({
      url: "https://github.com/acme/beta",
      host: "github.com",
      name: "acme/beta",
    });
  });
});
