// @effect-diagnostics nodeBuiltinImport:off -- Tests write a throwaway log directory.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { makeVoiceLogFile } from "./t3team-voiceLogFile.ts";

describe("makeVoiceLogFile", () => {
  it("appends lines and rotates once the file is full", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "voice-log-"));
    try {
      const filePath = NodePath.join(dir, "logs", "voice.log");
      const log = makeVoiceLogFile({ filePath, maxBytes: 40, maxFiles: 2 });
      log.write("[voice] first line 0123456789");
      log.write("[voice] second line 0123456789");
      log.write("[voice] third line 0123456789");
      await log.flushed();
      expect(NodeFS.readFileSync(filePath, "utf8")).toBe("[voice] third line 0123456789\n");
      expect(NodeFS.readFileSync(`${filePath}.1`, "utf8")).toBe("[voice] second line 0123456789\n");
      expect(NodeFS.readFileSync(`${filePath}.2`, "utf8")).toBe("[voice] first line 0123456789\n");
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });
});
