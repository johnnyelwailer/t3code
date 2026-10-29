import { describe, expect, it } from "vite-plus/test";
import type { NexiUpdateCheck } from "@t3tools/shared/t3team-nexiUpdateWire";

import {
  NexiUpdateIssue,
  makeNexiUpdateProviderClass,
  type NexiUpdateProviderDeps,
} from "./t3team-nexiUpdateProvider.ts";

const SHA = Buffer.alloc(64, 3).toString("base64");
const LOCAL_BEARER = "local-session-bearer";
const available: NexiUpdateCheck = {
  kind: "available",
  version: "0.1.2-rc.5",
  tag: "desktop-v0.1.2-rc.5",
  notes: "### Nexi Work 0.1.2-rc.5\n- a fix",
  htmlUrl: "https://nexplore.ghe.com/hive/nx-nexi/releases/tag/desktop-v0.1.2-rc.5",
  publishedAt: "2026-10-29T10:00:00Z",
  file: { assetId: 100, name: "Nexi-Work-0.1.2-rc.5-arm64-mac.zip", size: 42, sha512: SHA },
};

const make = (check: NexiUpdateCheck, over: Partial<NexiUpdateProviderDeps> = {}) => {
  const Provider = makeNexiUpdateProviderClass({
    currentVersion: "0.1.2-rc.4",
    check: async () => check,
    assetUrl: async (id, name) =>
      `http://127.0.0.1:3773/api/t3team/nexi-update/asset/${id}/${name}`,
    bearer: async () => LOCAL_BEARER,
    ...over,
  });
  return new Provider({}, {}, {});
};

describe("NexiUpdateProvider", () => {
  it("turns an available release into update info with the manifest's sha512 and the release notes", async () => {
    const provider = make(available);
    const info = await provider.getLatestVersion();
    expect(info).toMatchObject({
      version: "0.1.2-rc.5",
      path: "Nexi-Work-0.1.2-rc.5-arm64-mac.zip",
      sha512: SHA,
      releaseNotes: "### Nexi Work 0.1.2-rc.5\n- a fix",
      files: [{ url: "Nexi-Work-0.1.2-rc.5-arm64-mac.zip", sha512: SHA, size: 42 }],
    });
  });

  it("resolves the file to the local backend URL whose path ends in the file name", async () => {
    const provider = make(available);
    const files = provider.resolveFiles(await provider.getLatestVersion());
    expect(files).toHaveLength(1);
    expect(files[0]?.url.pathname).toBe(
      "/api/t3team/nexi-update/asset/100/Nexi-Work-0.1.2-rc.5-arm64-mac.zip",
    );
    expect(files[0]?.info.sha512).toBe(SHA);
  });

  it("downloads with the desktop's own bearer, and that bearer is nowhere in the update info", async () => {
    const provider = make(available);
    expect(provider.fileExtraDownloadHeaders).toBeNull();
    const info = await provider.getLatestVersion();
    expect(provider.fileExtraDownloadHeaders).toEqual({
      accept: "*/*",
      authorization: `Bearer ${LOCAL_BEARER}`,
    });
    expect(JSON.stringify(info)).not.toContain(LOCAL_BEARER);
  });

  it("answers an up-to-date check with the running version, which electron-updater reads as no update", async () => {
    const info = await make({ kind: "up-to-date" }).getLatestVersion();
    expect(info.version).toBe("0.1.2-rc.4");
    expect(info.files).toEqual([]);
  });

  it("raises a named issue for signed-out, unreachable and unsupported", async () => {
    for (const kind of ["signed-out", "unreachable", "unsupported"] as const) {
      const error = await make({ kind, message: `m-${kind}` })
        .getLatestVersion()
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NexiUpdateIssue);
      expect(error).toMatchObject({ kind, message: `m-${kind}` });
    }
  });

  it("probes for no blockmap: none is published", () => {
    expect(make(available).getBlockMapFiles()).toEqual([]);
  });
});
