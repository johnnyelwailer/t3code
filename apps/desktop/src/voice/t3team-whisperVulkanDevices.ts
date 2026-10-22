import type { WhisperAcceleration } from "./t3team-whisperProtocol.ts";

export type VulkanDevice = {
  readonly index: number;
  readonly name: string;
  /** ggml's `uma` flag: the GPU shares system memory, which is what an iGPU does. */
  readonly integrated: boolean;
};

export type WhisperDeviceKind = "discrete" | "integrated" | "cpu";

export type WhisperDeviceReport = {
  readonly kind: WhisperDeviceKind;
  /** Honest name for logs and the transcription result, e.g. `vulkan: NVIDIA GeForce RTX 5070`. */
  readonly label: string;
};

/** Env var that makes ggml enumerate only the listed Vulkan devices, renumbered from 0. */
export const VULKAN_VISIBLE_DEVICES_ENV = "GGML_VK_VISIBLE_DEVICES";

/** Matches ggml's `ggml_vulkan: 1 = NVIDIA GeForce RTX 5070 (NVIDIA) | uma: 0 | ...`. */
const VULKAN_DEVICE_LOG = /ggml_vulkan: (\d+) = (.*?) \| uma: ([01])/;
const VULKAN_VENDOR_SUFFIX = /\s+\([^()]*\)$/;
const DISCRETE_VENDOR = /NVIDIA|GeForce|AMD|Radeon|Arc/i;

export function parseVulkanDevices(logLines: readonly string[]): readonly VulkanDevice[] {
  return logLines.flatMap((line) => {
    const match = VULKAN_DEVICE_LOG.exec(line);
    if (!match) return [];
    const [, index, rawName, uma] = match;
    return [
      {
        index: Number(index),
        name: (rawName ?? "").replace(VULKAN_VENDOR_SUFFIX, "").trim(),
        integrated: uma === "1",
      },
    ];
  });
}

export const isDiscreteVulkanDevice = (device: VulkanDevice) =>
  !device.integrated && DISCRETE_VENDOR.test(device.name);
const isDiscrete = isDiscreteVulkanDevice;

/**
 * whisper.node always opens Vulkan device 0, so on a dual-GPU machine that is whatever the loader
 * lists first (usually the iGPU). Returns the device index to pin, or null to leave device 0 alone.
 */
export function pickVulkanDeviceToPin(devices: readonly VulkanDevice[]): number | null {
  const first = devices[0];
  if (devices.length < 2 || !first || isDiscrete(first)) return null;
  return devices.slice(1).find(isDiscrete)?.index ?? null;
}

/** `devices` is the list the worker itself saw; device 0 is the one whisper runs on. */
export function describeWhisperDevice(
  acceleration: WhisperAcceleration,
  devices: readonly VulkanDevice[],
): WhisperDeviceReport {
  if (acceleration === "cpu") return { kind: "cpu", label: "cpu" };
  const active = devices[0];
  if (!active) return { kind: "integrated", label: "gpu (unnamed device)" };
  return {
    kind: isDiscrete(active) ? "discrete" : "integrated",
    label: `vulkan: ${active.name}`,
  };
}
