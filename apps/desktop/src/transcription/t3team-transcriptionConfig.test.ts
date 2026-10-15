// @effect-diagnostics nodeBuiltinImport:off - writes a temporary config file.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { createNativeEngines, resolveHelperPath } from "./t3team-nativeEngines.ts";
import {
  createCustomEngines,
  loadTranscriptionConfig,
  parseTranscriptionConfig,
  TRANSCRIPTION_CONFIG_FILE,
} from "./t3team-transcriptionConfig.ts";

describe("transcription config", () => {
  it("parses custom engines and the preferred engine, dropping invalid entries", () => {
    const config = parseTranscriptionConfig({
      engine: "whisper",
      engines: [{ id: "whisper", command: "/bin/w", args: ["--m", 1] }, { id: "" }, "x"],
    });
    expect(config).toEqual({
      engine: "whisper",
      engines: [{ id: "whisper", label: "whisper", command: "/bin/w", args: ["--m"] }],
    });
    expect(parseTranscriptionConfig({ engine: "native" }).engine).toBeNull();
    expect(createCustomEngines(config).map((e) => [e.id, e.kind])).toEqual([["whisper", "custom"]]);
  });

  it("loads from userData and lets the env override the engine", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-tx-"));
    try {
      expect(loadTranscriptionConfig(dir, {})).toEqual({ engine: null, engines: [] });
      NodeFS.writeFileSync(
        NodePath.join(dir, TRANSCRIPTION_CONFIG_FILE),
        JSON.stringify({ engine: "a" }),
      );
      expect(loadTranscriptionConfig(dir, {}).engine).toBe("a");
      expect(
        loadTranscriptionConfig(dir, { T3TEAM_TRANSCRIPTION_ENGINE: "native" }).engine,
      ).toBeNull();
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("native engines", () => {
  const base = {
    resourcesPath: "/res",
    devRoot: "/repo",
    env: {} as Record<string, string | undefined>,
  };

  it("uses the packaged macOS helper", () => {
    const exists = (p: string) => p === "/res/transcription/t3team-transcribe";
    const engines = createNativeEngines({ ...base, platform: "darwin", exists });
    expect(engines.map((e) => [e.id, e.kind])).toEqual([["macos-speech", "native"]]);
  });

  it("runs the Windows helper through inbox Windows PowerShell", () => {
    const exists = (p: string) => p.endsWith("t3team-transcribe.ps1");
    const engines = createNativeEngines({
      ...base,
      platform: "win32",
      exists,
      env: { SystemRoot: "C:\\Windows" },
    });
    expect(engines.map((e) => e.id)).toEqual(["windows-speech"]);
  });

  it("has no native engine on Linux or when the helper is missing", () => {
    expect(createNativeEngines({ ...base, platform: "linux", exists: () => true })).toEqual([]);
    expect(createNativeEngines({ ...base, platform: "darwin", exists: () => false })).toEqual([]);
  });

  it("prefers the explicit helper override, then resources, then the dev checkout", () => {
    const env = { T3TEAM_TRANSCRIBE_HELPER: "/custom/helper" };
    expect(resolveHelperPath("h", { ...base, platform: "darwin", env, exists: () => true })).toBe(
      "/custom/helper",
    );
    expect(
      resolveHelperPath("h", { ...base, platform: "darwin", exists: (p) => p.startsWith("/repo") }),
    ).toBe(NodePath.join("/repo", "native", "t3team-transcription", "build", "h"));
  });
});
