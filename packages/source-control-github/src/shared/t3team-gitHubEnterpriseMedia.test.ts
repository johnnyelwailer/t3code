import { describe, expect, it } from "vite-plus/test";

import { definition } from "./definition.ts";
import { gitHubMediaUrl } from "./gitHubMedia.ts";

const media = (url: string) => definition.mediaUrl(new URL(url));

describe("GitHub Enterprise media URLs", () => {
  it("routes uploads and committed files on an enterprise host through the server", () => {
    expect(
      media(
        "https://nexplore.ghe.com/user-attachments/assets/3952be71-42e8-44d1-bd5b-ed2fe719d3f2",
      ),
    ).toEqual({
      fetchUrl:
        "https://nexplore.ghe.com/user-attachments/assets/3952be71-42e8-44d1-bd5b-ed2fe719d3f2",
      fileName: "3952be71-42e8-44d1-bd5b-ed2fe719d3f2",
      kind: "video",
      immutable: true,
    });
    expect(media("https://nexplore.ghe.com/hive/nx-nexi/assets/45952064/1a1842fb")?.fetchUrl).toBe(
      "https://nexplore.ghe.com/hive/nx-nexi/assets/45952064/1a1842fb",
    );
    expect(
      media("https://nexplore.ghe.com/hive/nx-nexi/blob/pr-evidence/pr-1356/shot.png?raw=true"),
    ).toEqual({
      fetchUrl: "https://raw.nexplore.ghe.com/hive/nx-nexi/pr-evidence/pr-1356/shot.png",
      fileName: "shot.png",
    });
    expect(media("https://NEXPLORE.ghe.com/hive/nx-nexi/raw/main/docs/a.png")?.fetchUrl).toBe(
      "https://raw.nexplore.ghe.com/hive/nx-nexi/main/docs/a.png",
    );
    expect(media("https://raw.nexplore.ghe.com/hive/nx-nexi/main/docs/a.png")?.fetchUrl).toBe(
      "https://raw.nexplore.ghe.com/hive/nx-nexi/main/docs/a.png",
    );
    expect(media("https://ghe.acme.internal/o/r/blob/main/a.png")?.fetchUrl).toBe(
      "https://raw.ghe.acme.internal/o/r/main/a.png",
    );
  });

  it("claims nothing outside an enterprise host's media paths", () => {
    for (const url of [
      "http://nexplore.ghe.com/user-attachments/assets/1a1842fb",
      "https://nexplore.ghe.com/hive/nx-nexi/pull/1356",
      "https://ghe.com/user-attachments/assets/1a1842fb",
      "https://raw.ghe.com/o/r/main/a.png",
      "https://objects-origin.nexplore.ghe.com/github-production-user-asset/a.png",
      "https://example.com/o/r/blob/main/a.png",
    ]) {
      expect(media(url), url).toBeNull();
    }
  });

  it("takes the enterprise host set as an argument", () => {
    const onlyAcme = (host: string) => host === "code.acme.com";
    expect(gitHubMediaUrl(new URL("https://code.acme.com/o/r/blob/main/a.png"), onlyAcme)).toEqual({
      fetchUrl: "https://raw.code.acme.com/o/r/main/a.png",
      fileName: "a.png",
    });
    expect(
      gitHubMediaUrl(new URL("https://nexplore.ghe.com/o/r/blob/main/a.png"), onlyAcme),
    ).toBeNull();
  });
});
