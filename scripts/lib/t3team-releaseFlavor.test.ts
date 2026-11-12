// @effect-diagnostics nodeBuiltinImport:off - writes preset fixtures to a temp dir.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_DESKTOP_APP_ID,
  flagPresetExtraResources,
  readFlagPresetForStaging,
  resolveDesktopAppId,
} from "./t3team-releaseFlavor.ts";

function presetFile(text: string): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-release-flavor-"));
  const file = NodePath.join(dir, "preset.json");
  NodeFS.writeFileSync(file, text);
  return file;
}

describe("release flavor build inputs", () => {
  it("keeps the upstream app id unless a flavor overrides it with a reverse-DNS id", () => {
    expect(resolveDesktopAppId({})).toBe(DEFAULT_DESKTOP_APP_ID);
    expect(
      resolveDesktopAppId({ T3CODE_DESKTOP_APP_ID: "ch.nexplore.nexi.work.nightly.user" }),
    ).toBe("ch.nexplore.nexi.work.nightly.user");
    expect(() => resolveDesktopAppId({ T3CODE_DESKTOP_APP_ID: "not an id" })).toThrow(
      /reverse-DNS/,
    );
  });

  it("stages a valid preset as an extra resource and rejects a malformed one", () => {
    expect(readFlagPresetForStaging({})).toBeUndefined();
    expect(flagPresetExtraResources(false)).toEqual([]);
    const text = JSON.stringify({ flavor: "nightly-dogfood", flags: { MYWORK_KANBAN: true } });
    expect(readFlagPresetForStaging({ T3CODE_DESKTOP_FLAG_PRESET: presetFile(text) })).toBe(text);
    expect(flagPresetExtraResources(true)).toEqual([
      { from: "apps/desktop/prod-resources/flag-preset.json", to: "flag-preset.json" },
    ]);
    const bad = presetFile('{"flags":{"MYWORK_KANBAN":1}}');
    expect(() => readFlagPresetForStaging({ T3CODE_DESKTOP_FLAG_PRESET: bad })).toThrow(/boolean/);
  });
});
