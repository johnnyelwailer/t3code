import { describe, expect, it } from "@effect/vitest";

import { machineRepositoryFromRemote } from "./t3team-cloudSessionMachineNames.ts";

const API = {
  url: "https://nexplore.ghe.com/acme/api.git",
  host: "nexplore.ghe.com",
  owner: "acme",
  name: "api",
};

describe("machineRepositoryFromRemote", () => {
  it("normalizes https, ssh and scp-style remotes to one https URL", () => {
    for (const remote of [
      "https://nexplore.ghe.com/acme/api.git",
      "https://nexplore.ghe.com/acme/api",
      "https://user:secret@nexplore.ghe.com/acme/api.git",
      "ssh://git@nexplore.ghe.com/acme/api.git",
      "git@nexplore.ghe.com:acme/api.git",
      "  git@nexplore.ghe.com:acme/api\n",
    ]) {
      expect(machineRepositoryFromRemote(remote), remote).toEqual(API);
    }
  });

  it("never carries credentials into the clone URL", () => {
    expect(machineRepositoryFromRemote("https://x:ghp_secret@github.com/a/b.git")?.url).toBe(
      "https://github.com/a/b.git",
    );
  });

  it("refuses remotes the session cannot fetch over https", () => {
    for (const remote of [
      "/srv/git/api.git",
      "../api",
      "file:///srv/git/api.git",
      "git://github.com/acme/api.git",
      "https://gitlab.example.com/group/sub/api.git",
      "ssh://git@github.com:2222/acme/api.git",
      "https://github.com/acme",
      "",
    ]) {
      expect(machineRepositoryFromRemote(remote), remote).toBeNull();
    }
  });
});
