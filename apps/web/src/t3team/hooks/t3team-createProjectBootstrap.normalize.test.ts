import { describe, expect, it } from "vite-plus/test";

import { normalizeRepositoryUrls } from "./t3team-createProjectBootstrap";

describe("normalizeRepositoryUrls", () => {
  it("gives a pasted host/owner/repo an https scheme so git does not read it as a local path", () => {
    expect(normalizeRepositoryUrls(["nexplore.ghe.com/hive/common-agentdirectives"])).toEqual([
      "https://nexplore.ghe.com/hive/common-agentdirectives",
    ]);
  });

  it("leaves full URLs, ssh remotes and local paths alone and dedupes", () => {
    expect(
      normalizeRepositoryUrls([
        "https://nexplore.ghe.com/hive/a",
        " https://nexplore.ghe.com/hive/a ",
        "git@nexplore.ghe.com:hive/b.git",
        "D:/repos/c",
        "./relative/path",
      ]),
    ).toEqual([
      "https://nexplore.ghe.com/hive/a",
      "git@nexplore.ghe.com:hive/b.git",
      "D:/repos/c",
      "./relative/path",
    ]);
  });
});
