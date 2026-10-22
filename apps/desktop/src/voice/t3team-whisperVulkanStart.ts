import {
  parseVulkanDevices,
  pickVulkanDeviceToPin,
  VULKAN_VISIBLE_DEVICES_ENV,
} from "./t3team-whisperVulkanDevices.ts";
import type { LiveWhisperWorker, WhisperWorkerEnv } from "./t3team-whisperWorkerClient.ts";

/** `undefined` until the first load has shown which devices exist; `null` once it needs no pin. */
export type VulkanPinState = { pin?: number | null };

const pinEnv = (index: number): WhisperWorkerEnv => ({
  [VULKAN_VISIBLE_DEVICES_ENV]: String(index),
});

/**
 * whisper.node cannot choose a Vulkan device, so the first load runs unpinned just to read the
 * device list. If the loader put an iGPU first, that worker is replaced by one that only sees the
 * discrete GPU. The verdict is remembered, so later loads start pinned (or plain) straight away.
 */
export async function startVulkanWorker(input: {
  readonly start: (env?: WhisperWorkerEnv) => Promise<LiveWhisperWorker>;
  readonly state: VulkanPinState;
  readonly log: (message: string) => void;
}): Promise<LiveWhisperWorker> {
  const { state } = input;
  if (typeof state.pin === "number") return input.start(pinEnv(state.pin));
  const probe = await input.start();
  if (state.pin === null) return probe;
  const devices = parseVulkanDevices(probe.vulkanLog);
  const pin = pickVulkanDeviceToPin(devices);
  state.pin = pin;
  if (pin === null) return probe;
  const nameOf = (index: number) => devices.find((device) => device.index === index)?.name;
  input.log(`vulkan device 0 is "${nameOf(0)}"; restarting whisper on "${nameOf(pin)}"`);
  probe.handle.kill();
  return input.start(pinEnv(pin));
}
