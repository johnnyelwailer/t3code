import type { VulkanDeviceMemory } from "./t3team-whisperDeviceMemory.ts";
import {
  isDiscreteVulkanDevice,
  parseVulkanDevices,
  pickVulkanDeviceToPin,
  VULKAN_VISIBLE_DEVICES_ENV,
} from "./t3team-whisperVulkanDevices.ts";
import type { LiveWhisperWorker, WhisperWorkerEnv } from "./t3team-whisperWorkerClient.ts";

/**
 * `pin` is `undefined` until a load has shown which devices exist, and `null` once none is needed.
 * `name` is the device the pin pointed at, so a pin carried over from an earlier run is checked
 * before it is trusted (the loader can renumber devices after a driver update or a new GPU).
 */
export type VulkanPinState = { pin?: number | null; name?: string; verified?: boolean };

export function initialVulkanPinState(memory: VulkanDeviceMemory | undefined): VulkanPinState {
  const remembered = memory?.load() ?? null;
  return remembered ? { pin: remembered.index, name: remembered.name } : {};
}

const pinEnv = (index: number): WhisperWorkerEnv => ({
  [VULKAN_VISIBLE_DEVICES_ENV]: String(index),
});

/**
 * whisper.node always runs on Vulkan device 0, which on a dual-GPU machine is usually the iGPU.
 * The first start ever loads unpinned to read the device list and, when a discrete GPU sits
 * behind the iGPU, restarts pinned to it. The pin is remembered (in memory and in `memory`), so
 * every later start, including the first one after an app restart, goes straight to that GPU.
 */
export async function startVulkanWorker(input: {
  readonly start: (env?: WhisperWorkerEnv) => Promise<LiveWhisperWorker>;
  readonly state: VulkanPinState;
  readonly log: (message: string) => void;
  readonly memory?: VulkanDeviceMemory;
}): Promise<LiveWhisperWorker> {
  const { state } = input;
  const forget = (reason: string) => {
    input.log(
      `remembered vulkan device ${String(state.pin)} ("${state.name}") ${reason}; probing devices again`,
    );
    delete state.pin;
    delete state.name;
    delete state.verified;
    input.memory?.save(null);
  };
  if (typeof state.pin === "number") {
    let pinned: LiveWhisperWorker;
    try {
      pinned = await input.start(pinEnv(state.pin));
    } catch (error) {
      if (state.verified === true) throw error;
      forget(`failed to load (${String(error)})`);
      return startVulkanWorker(input);
    }
    const active = parseVulkanDevices(pinned.vulkanLog)[0];
    const stillThere =
      state.name === undefined ||
      (active !== undefined && active.name === state.name && isDiscreteVulkanDevice(active));
    if (stillThere) {
      state.verified = true;
      return pinned;
    }
    pinned.handle.kill();
    forget(`now opens "${active?.name ?? "nothing"}"`);
  }
  const probe = await input.start();
  if (state.pin === null) return probe;
  const devices = parseVulkanDevices(probe.vulkanLog);
  const pin = pickVulkanDeviceToPin(devices);
  state.pin = pin;
  if (pin === null) return probe;
  const nameOf = (index: number) => devices.find((device) => device.index === index)?.name;
  const pinnedName = nameOf(pin) ?? "";
  state.verified = true;
  if (pinnedName !== "") {
    state.name = pinnedName;
    input.memory?.save({ index: pin, name: pinnedName });
  }
  input.log(`vulkan device 0 is "${nameOf(0)}"; restarting whisper on "${pinnedName}"`);
  probe.handle.kill();
  return input.start(pinEnv(pin));
}
