// @effect-diagnostics nodeBuiltinImport:off -- Tests write a throwaway state file.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { makeFileVulkanDeviceMemory } from "./t3team-whisperDeviceMemory.ts";

describe("makeFileVulkanDeviceMemory", () => {
  it("round-trips the pinned device, forgets it, and ignores a corrupt file", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "voice-device-"));
    try {
      const filePath = NodePath.join(dir, "voice", "vulkan-device.json");
      const memory = makeFileVulkanDeviceMemory(filePath);
      expect(memory.load()).toBeNull();
      memory.save({ index: 1, name: "NVIDIA GeForce RTX 5070" });
      expect(makeFileVulkanDeviceMemory(filePath).load()).toEqual({
        index: 1,
        name: "NVIDIA GeForce RTX 5070",
      });
      memory.save(null);
      expect(memory.load()).toBeNull();
      NodeFS.writeFileSync(filePath, "{not json");
      expect(memory.load()).toBeNull();
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });
});
