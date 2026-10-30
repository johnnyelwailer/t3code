import { describe, expect, it } from "vite-plus/test";

import {
  isEligibleNexiTag,
  isSupportedNexiRuntime,
  parseNexiUpdateManifest,
  pickNexiUpdate,
  selectNexiPayload,
  type NexiGheRelease,
} from "./t3team-nexiUpdateSelect.ts";

const SHA = Buffer.alloc(64, 7).toString("base64");
const asset = (id: number, name: string, size = 100) => ({ id, name, size, state: "uploaded" });

function release(version: string, over: Partial<NexiGheRelease> = {}): NexiGheRelease {
  const arm = `Nexi-Work-${version}-arm64-20261029-2040.zip`;
  const exe = `Nexi-Work-${version}-x64-20261027-0647.exe`;
  return {
    tag_name: `desktop-v${version}`,
    draft: false,
    prerelease: version.includes("-"),
    body: `notes ${version}`,
    html_url: `https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v${version}`,
    published_at: "2026-10-29T10:00:00Z",
    assets: [
      asset(1, arm),
      asset(2, `Nexi-Work-${version}-arm64-20261029-2040.dmg`),
      asset(6, `Nexi-Work-${version}-arm64-20261029-2040.zip.sha256`, 90),
      asset(3, exe),
      asset(4, "latest-mac.yml", 200),
      asset(5, "latest.yml", 200),
    ],
    ...over,
  };
}

const mac = { platform: "darwin", arch: "arm64" } as const;
const win = { platform: "win32", arch: "x64" } as const;

describe("which tags are desktop releases", () => {
  it("accepts desktop-v tags with a strict version and nothing else", () => {
    expect(isEligibleNexiTag("desktop-v0.1.2")).toBe("0.1.2");
    expect(isEligibleNexiTag("desktop-v0.1.2-rc.5")).toBe("0.1.2-rc.5");
    expect(isEligibleNexiTag("android-v2.0.1")).toBeNull();
    expect(isEligibleNexiTag("v0.1.2")).toBeNull();
    expect(isEligibleNexiTag("desktop-v0.1")).toBeNull();
    expect(isEligibleNexiTag("desktop-v0.1.2/../x")).toBeNull();
  });
});

describe("pickNexiUpdate: version compare", () => {
  it("offers rc.5 to an rc.4 build (every desktop release today is a pre-release)", () => {
    const picked = pickNexiUpdate({
      releases: [release("0.1.2-rc.4"), release("0.1.2-rc.5")],
      currentVersion: "0.1.2-rc.4",
      ...mac,
    });
    expect(picked?.release.tag_name).toBe("desktop-v0.1.2-rc.5");
    expect(picked?.version).toBe("0.1.2-rc.5");
  });

  it("offers nothing for an equal or an older release", () => {
    const releases = [release("0.1.2-rc.4"), release("0.1.2-rc.5")];
    expect(pickNexiUpdate({ releases, currentVersion: "0.1.2-rc.5", ...mac })).toBeNull();
    expect(pickNexiUpdate({ releases, currentVersion: "0.1.2", ...mac })).toBeNull();
    expect(pickNexiUpdate({ releases, currentVersion: "0.2.0-rc.1", ...mac })).toBeNull();
  });

  it("compares numerically, not as text (rc.10 > rc.9), and a stable beats its own rc", () => {
    expect(
      pickNexiUpdate({ releases: [release("0.1.2-rc.10")], currentVersion: "0.1.2-rc.9", ...win })
        ?.version,
    ).toBe("0.1.2-rc.10");
    expect(
      pickNexiUpdate({ releases: [release("0.1.2")], currentVersion: "0.1.2-rc.9", ...win })
        ?.version,
    ).toBe("0.1.2");
  });

  it("takes the highest of several newer releases whatever order GitHub lists them in", () => {
    const releases = [release("0.1.3-rc.1"), release("0.1.2-rc.5"), release("0.1.3-rc.2")];
    expect(pickNexiUpdate({ releases, currentVersion: "0.1.2-rc.4", ...mac })?.version).toBe(
      "0.1.3-rc.2",
    );
  });
});

describe("pickNexiUpdate: pre-release policy", () => {
  it("a pre-release build follows pre-releases and stable", () => {
    const releases = [release("0.1.2-rc.5"), release("0.1.2")];
    expect(pickNexiUpdate({ releases, currentVersion: "0.1.2-rc.4", ...mac })?.version).toBe(
      "0.1.2",
    );
  });

  it("a stable build follows stable only, by tag and by the GitHub flag", () => {
    expect(
      pickNexiUpdate({ releases: [release("0.1.3-rc.1")], currentVersion: "0.1.2", ...mac }),
    ).toBeNull();
    expect(
      pickNexiUpdate({
        releases: [release("0.1.3", { prerelease: true })],
        currentVersion: "0.1.2",
        ...mac,
      }),
    ).toBeNull();
    expect(
      pickNexiUpdate({ releases: [release("0.1.3")], currentVersion: "0.1.2", ...mac })?.version,
    ).toBe("0.1.3");
  });
});

describe("pickNexiUpdate: only real desktop releases", () => {
  it("ignores android-v* releases, drafts and foreign tags even when newer", () => {
    const releases = [
      release("9.0.0", { tag_name: "android-v9.0.0" }),
      release("8.0.0", { draft: true }),
      release("7.0.0", { tag_name: "v7.0.0" }),
      release("0.1.2-rc.5"),
    ];
    expect(pickNexiUpdate({ releases, currentVersion: "0.1.2-rc.4", ...mac })?.version).toBe(
      "0.1.2-rc.5",
    );
  });

  it("falls back to an older candidate when the newest has no payload for this platform", () => {
    const broken = release("0.1.3-rc.1", { assets: [asset(9, "latest.yml")] });
    expect(
      pickNexiUpdate({
        releases: [broken, release("0.1.2-rc.5")],
        currentVersion: "0.1.2-rc.4",
        ...mac,
      })?.version,
    ).toBe("0.1.2-rc.5");
  });

  it("offers nothing for a build whose own version is not a release version", () => {
    expect(
      pickNexiUpdate({ releases: [release("0.1.2")], currentVersion: "dev", ...mac }),
    ).toBeNull();
  });
});

describe("selectNexiPayload: the right asset per platform and arch", () => {
  const r = release("0.1.2");
  it("macOS arm64 takes the ZIP (not the DMG or its .sha256, named as the real build names it) and latest-mac.yml", () => {
    const picked = selectNexiPayload(r.assets, "0.1.2", mac);
    expect(picked?.payload.name).toBe("Nexi-Work-0.1.2-arm64-20261029-2040.zip");
    expect(picked?.manifest.name).toBe("latest-mac.yml");
  });
  it("Windows x64 takes the NSIS .exe (not its .sha256) and latest.yml", () => {
    const withSidecar = [...r.assets, asset(6, "Nexi-Work-0.1.2-x64-20261027-0647.exe.sha256", 90)];
    const picked = selectNexiPayload(withSidecar, "0.1.2", win);
    expect(picked?.payload.name).toBe("Nexi-Work-0.1.2-x64-20261027-0647.exe");
    expect(picked?.manifest.name).toBe("latest.yml");
  });
  it("Windows on arm64 runs the x64 installer under emulation", () => {
    expect(
      selectNexiPayload(r.assets, "0.1.2", { platform: "win32", arch: "arm64" })?.payload.name,
    ).toMatch(/x64.*\.exe$/u);
  });
  it("an Intel Mac, and a Linux release without an AppImage, get nothing", () => {
    expect(selectNexiPayload(r.assets, "0.1.2", { platform: "darwin", arch: "x64" })).toBeNull();
    expect(selectNexiPayload(r.assets, "0.1.2", { platform: "linux", arch: "x64" })).toBeNull();
  });
  it("an asset of another version never matches", () => {
    expect(selectNexiPayload(r.assets, "0.1.3", mac)).toBeNull();
  });
});

describe("selectNexiPayload with the names a real build publishes (workflow run 365078677)", () => {
  const real = [
    asset(1, "Nexi-Work-0.1.2-test.1-arm64-20261029-2040.dmg"),
    asset(2, "Nexi-Work-0.1.2-test.1-arm64-20261029-2040.dmg.sha256"),
    asset(3, "Nexi-Work-0.1.2-test.1-arm64-20261029-2040.dmg.verification.txt"),
    asset(4, "Nexi-Work-0.1.2-test.1-arm64-20261029-2040.zip"),
    asset(5, "Nexi-Work-0.1.2-test.1-arm64-20261029-2040.zip.sha256"),
    asset(6, "Nexi-Work-0.1.2-test.1-x64-20261029-1733.exe"),
    asset(7, "Nexi-Work-0.1.2-test.1-x64-20261029-1733.exe.sha256"),
    asset(8, "Nexi-Work-0.1.2-test.1-x64-20261029-1733.exe.verification.txt"),
    asset(9, "latest-mac.yml"),
    asset(10, "latest.yml"),
  ];
  it("picks the ZIP on macOS arm64 and the .exe on Windows x64", () => {
    expect(selectNexiPayload(real, "0.1.2-test.1", mac)?.payload.id).toBe(4);
    expect(selectNexiPayload(real, "0.1.2-test.1", win)?.payload.id).toBe(6);
  });
});

describe("Linux: the x64 AppImage and latest-linux.yml", () => {
  const linux = { platform: "linux", arch: "x64" } as const;
  const assets = [
    asset(1, "Nexi-Work-0.1.2-rc.7-x86_64-20261030-1030.AppImage", 281_430_515),
    asset(2, "Nexi-Work-0.1.2-rc.7-x86_64-20261030-1030.AppImage.sha256", 119),
    asset(3, "latest-linux.yml"),
    asset(4, "latest.yml"),
    asset(5, "latest-mac.yml"),
  ];
  it("takes the AppImage electron-builder names x86_64 (and an x64 one), never its .sha256", () => {
    expect(selectNexiPayload(assets, "0.1.2-rc.7", linux)?.payload.id).toBe(1);
    expect(selectNexiPayload(assets, "0.1.2-rc.7", linux)?.manifest.name).toBe("latest-linux.yml");
    const x64Named = [
      asset(1, "Nexi-Work-0.1.2-rc.7-x64-20261030-1030.AppImage"),
      asset(3, "latest-linux.yml"),
    ];
    expect(selectNexiPayload(x64Named, "0.1.2-rc.7", linux)?.payload.id).toBe(1);
  });
  it("needs its own manifest and an arch it is built for", () => {
    expect(
      selectNexiPayload(
        assets.filter((a) => a.name !== "latest-linux.yml"),
        "0.1.2-rc.7",
        linux,
      ),
    ).toBeNull();
    expect(
      selectNexiPayload(assets, "0.1.2-rc.7", { platform: "linux", arch: "arm64" }),
    ).toBeNull();
    expect(selectNexiPayload(assets, "0.1.2-rc.8", linux)).toBeNull();
  });
  it("is a supported runtime, and an rc.6 Linux build is offered rc.7 as a pre-release", () => {
    expect(isSupportedNexiRuntime(linux)).toBe(true);
    const rc7 = release("0.1.2-rc.7", { assets });
    expect(
      pickNexiUpdate({ releases: [rc7], currentVersion: "0.1.2-rc.6", ...linux })?.payload.name,
    ).toMatch(/\.AppImage$/u);
  });
});

describe("parseNexiUpdateManifest", () => {
  const text = (over = "") =>
    `version: 0.1.2\nfiles:\n  - url: Nexi-Work-0.1.2-arm64-20261029-2040.zip\n    sha512: ${SHA}\n    size: 100\npath: Nexi-Work-0.1.2-arm64-20261029-2040.zip\nsha512: ${SHA}\nreleaseDate: '2026-10-29T00:00:00.000Z'\n${over}`;

  it("reads the version, file, sha512 and size", () => {
    expect(parseNexiUpdateManifest(text())).toEqual({
      version: "0.1.2",
      path: "Nexi-Work-0.1.2-arm64-20261029-2040.zip",
      sha512: SHA,
      size: 100,
    });
  });
  it("refuses a manifest without a valid sha512 or with a path that is a path", () => {
    expect(parseNexiUpdateManifest(text().replaceAll(SHA, "short"))).toBeNull();
    expect(parseNexiUpdateManifest(text().replace(/^path: .*$/mu, "path: ../evil.zip"))).toBeNull();
    expect(parseNexiUpdateManifest("")).toBeNull();
  });
});
