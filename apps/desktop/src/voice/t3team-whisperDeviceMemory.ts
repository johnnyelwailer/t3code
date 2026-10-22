// @effect-diagnostics nodeBuiltinImport:off -- Tiny JSON file next to the GPU crash sentinel, read before any Effect runtime.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/** The Vulkan device whisper was pinned to last time, so the next app start pins it straight away. */
export type RememberedVulkanDevice = { readonly index: number; readonly name: string };

export type VulkanDeviceMemory = {
  readonly load: () => RememberedVulkanDevice | null;
  readonly save: (device: RememberedVulkanDevice | null) => void;
};

const isRemembered = (value: unknown): value is RememberedVulkanDevice =>
  typeof value === "object" &&
  value !== null &&
  Number.isInteger((value as { index?: unknown }).index) &&
  (value as { index: number }).index >= 0 &&
  typeof (value as { name?: unknown }).name === "string" &&
  (value as { name: string }).name !== "";

/** Best effort: an unreadable or corrupt file only costs one probe start, as before. */
export function makeFileVulkanDeviceMemory(filePath: string): VulkanDeviceMemory {
  return {
    load: () => {
      try {
        const parsed: unknown = JSON.parse(NodeFS.readFileSync(filePath, "utf8"));
        return isRemembered(parsed) ? { index: parsed.index, name: parsed.name } : null;
      } catch {
        return null;
      }
    },
    save: (device) => {
      try {
        if (device === null) {
          NodeFS.rmSync(filePath, { force: true });
          return;
        }
        NodeFS.mkdirSync(NodePath.dirname(filePath), { recursive: true });
        NodeFS.writeFileSync(filePath, JSON.stringify(device));
      } catch {
        // Remembering is an optimisation; the probe start still works without it.
      }
    },
  };
}
