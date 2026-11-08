import { DEFAULT_VOICE_TRANSCRIBER_MODEL } from "@t3tools/contracts";

import type { WhisperDeviceKind } from "./t3team-whisperVulkanDevices.ts";

export const LARGE_TIER_WHISPER_MODEL = DEFAULT_VOICE_TRANSCRIBER_MODEL;
export const SMALL_TIER_WHISPER_MODEL = "base";
/** Better than `base` for German at dictation speed on a GPU; used when it is already on disk. */
export const MID_TIER_WHISPER_MODEL = "small";
/** The full large-v3 (the Activity Tracker's): only ever picked on a discrete GPU. */
export const FULL_LARGE_WHISPER_MODEL = "large-v3";

/**
 * The model to use when `voice.transcriber.model` is empty. Only a discrete GPU runs the large tier
 * at dictation speed; an iGPU or the CPU gets `base`. A configured model never goes through here.
 */
export function defaultWhisperModelFor(kind: WhisperDeviceKind): string {
  return kind === "discrete" ? LARGE_TIER_WHISPER_MODEL : SMALL_TIER_WHISPER_MODEL;
}
