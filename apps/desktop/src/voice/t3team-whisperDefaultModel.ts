import { DEFAULT_VOICE_TRANSCRIBER_MODEL } from "@t3tools/contracts";

import type { WhisperDeviceKind } from "./t3team-whisperVulkanDevices.ts";

export const LARGE_TIER_WHISPER_MODEL = DEFAULT_VOICE_TRANSCRIBER_MODEL;
export const SMALL_TIER_WHISPER_MODEL = "base";

/**
 * The model to use when `voice.transcriber.model` is empty. Only a discrete GPU runs the large tier
 * at dictation speed; an iGPU or the CPU gets `base`. A configured model never goes through here.
 */
export function defaultWhisperModelFor(kind: WhisperDeviceKind): string {
  return kind === "discrete" ? LARGE_TIER_WHISPER_MODEL : SMALL_TIER_WHISPER_MODEL;
}
