import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

const root = NodePath.resolve(import.meta.dirname, "..");

function sources(directory: string): string[] {
  return NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|stories)\./.test(entry.name) ? [path] : [];
  });
}

/**
 * Native HTTP clients cannot send the broker loopback cookie. Every file that hands one a URL must
 * pass it through `authorizeNativeFetch` (downloads) or mint it with `resolveAssetUrl`, which the
 * asset URL observer covers (uploads, image/media/markdown/favicon loaders).
 */
describe("native consumers of loopback URLs", () => {
  const nativeFetchCall = /File\.downloadFileAsync\(|\.upload\(\s*(url|target)\b/;

  it("lists every file that starts a native download or upload", () => {
    const callers = sources(root)
      .filter((file) => nativeFetchCall.test(NodeFS.readFileSync(file, "utf8")))
      .map((file) => NodePath.relative(root, file));
    expect(callers.sort()).toEqual(["lib/attachmentDownload.ts", "lib/attachmentUpload.ts"]);
  });

  it("authorizes downloads before Expo's downloader and mints upload URLs with resolveAssetUrl", () => {
    const download = NodeFS.readFileSync(NodePath.join(root, "lib/attachmentDownload.ts"), "utf8");
    const calls = [...download.matchAll(/File\.downloadFileAsync\(/g)];
    const authorizations = [...download.matchAll(/authorizeNativeFetch\(/g)];
    expect(calls).toHaveLength(2);
    expect(authorizations).toHaveLength(2);
    calls.forEach((call, index) => {
      expect(authorizations[index]!.index).toBeLessThan(call.index);
    });
    const upload = NodeFS.readFileSync(NodePath.join(root, "lib/attachmentUpload.ts"), "utf8");
    expect(upload).toContain("resolveAssetUrl(currentConnection.value.httpBaseUrl, relativeUrl)");
  });

  it("registers the asset URL observer where the broker is wired", () => {
    const broker = NodeFS.readFileSync(
      NodePath.join(root, "connection/t3team-nexiBroker.ts"),
      "utf8",
    );
    expect(broker).toContain("setAssetUrlObserver(authorizeNativeFetch)");
  });
});
