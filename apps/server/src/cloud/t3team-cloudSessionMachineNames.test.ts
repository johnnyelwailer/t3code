import { describe, expect, it } from "@effect/vitest";

import {
  machineRepositoryFromRemote,
  sessionWorkspaceName,
} from "./t3team-cloudSessionMachineNames.ts";

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

describe("sessionWorkspaceName", () => {
  it("is the creator's own: two users on one project never share a snapshot", () => {
    expect(sessionWorkspaceName("pj", API)).toBe("m-pj.acme.api");
    expect(sessionWorkspaceName("other", API)).toBe("m-other.acme.api");
    expect(sessionWorkspaceName("pj", null)).toBe("u-pj");
  });

  it("stays within the workflow's workspace rule, and long names stay distinct", () => {
    const a = sessionWorkspaceName("pj", { owner: "o".repeat(40), name: `${"n".repeat(40)}-a` });
    const b = sessionWorkspaceName("pj", { owner: "o".repeat(40), name: `${"n".repeat(40)}-b` });
    for (const name of [a, b]) {
      expect(name).toHaveLength(64);
      expect(name).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
    }
    expect(a).not.toBe(b);
  });
});
