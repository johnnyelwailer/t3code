import { describe, expect, it } from "vite-plus/test";

import {
  describeWhisperDevice,
  parseVulkanDevices,
  pickVulkanDeviceToPin,
} from "./t3team-whisperVulkanDevices.ts";

const INTEL =
  "ggml_vulkan: 0 = Intel(R) Graphics (Intel Corporation) | uma: 1 | fp16: 1 | bf16: 0 | warp size: 32";
const NVIDIA =
  "ggml_vulkan: 1 = NVIDIA GeForce RTX 5070 (NVIDIA) | uma: 0 | fp16: 1 | bf16: 1 | warp size: 32";
const HEADER = "ggml_vulkan: Found 2 Vulkan devices:";
const nvidiaAt = (index: number) => NVIDIA.replace("1 =", `${index} =`);
const intelAt = (index: number) => INTEL.replace("0 =", `${index} =`);

describe("parseVulkanDevices", () => {
  it("reads index, vendor-free name and the uma flag, skipping other log lines", () => {
    expect(parseVulkanDevices([HEADER, INTEL, NVIDIA, "whisper_backend_init_gpu: x"])).toEqual([
      { index: 0, name: "Intel(R) Graphics", integrated: true },
      { index: 1, name: "NVIDIA GeForce RTX 5070", integrated: false },
    ]);
  });

  it("returns nothing when ggml logged no Vulkan devices", () => {
    expect(parseVulkanDevices(["whisper_init: no GPU found"])).toEqual([]);
  });
});

describe("pickVulkanDeviceToPin", () => {
  const pick = (...lines: string[]) => pickVulkanDeviceToPin(parseVulkanDevices(lines));

  it("pins the discrete GPU when the iGPU is listed first", () => {
    expect(pick(HEADER, INTEL, NVIDIA)).toBe(1);
  });

  it("leaves device 0 alone when the discrete GPU is already first", () => {
    expect(pick(HEADER, nvidiaAt(0), intelAt(1))).toBeNull();
  });

  it("does not restart on a single-GPU machine", () => {
    expect(pick(INTEL)).toBeNull();
    expect(pick(nvidiaAt(0))).toBeNull();
  });

  it("does nothing without any Vulkan device", () => {
    expect(pick()).toBeNull();
  });

  it("does not move between two integrated GPUs", () => {
    const amdIgpu = "ggml_vulkan: 1 = AMD Radeon(TM) Graphics (AMD proprietary driver) | uma: 1";
    expect(pick(INTEL, amdIgpu)).toBeNull();
  });

  it("takes the first discrete device behind an AMD iGPU", () => {
    const amdIgpu = "ggml_vulkan: 0 = AMD Radeon(TM) Graphics (AMD proprietary driver) | uma: 1";
    expect(pick(amdIgpu, nvidiaAt(1))).toBe(1);
  });
});

describe("describeWhisperDevice", () => {
  const devices = (...lines: string[]) => parseVulkanDevices(lines);

  it("names the discrete device that runs the pass", () => {
    expect(describeWhisperDevice("gpu", devices(nvidiaAt(0)))).toEqual({
      kind: "discrete",
      label: "vulkan: NVIDIA GeForce RTX 5070",
    });
  });

  it("names an iGPU instead of claiming a bare gpu", () => {
    expect(describeWhisperDevice("gpu", devices(INTEL, NVIDIA))).toEqual({
      kind: "integrated",
      label: "vulkan: Intel(R) Graphics",
    });
  });

  it("reports cpu without consulting devices", () => {
    expect(describeWhisperDevice("cpu", devices(INTEL))).toEqual({ kind: "cpu", label: "cpu" });
  });

  it("is honest when a GPU worked but no device was logged", () => {
    expect(describeWhisperDevice("gpu", [])).toEqual({
      kind: "integrated",
      label: "gpu (unnamed device)",
    });
  });
});
