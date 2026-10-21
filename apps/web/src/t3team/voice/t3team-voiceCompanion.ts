/**
 * The voice overlay's companion: which `surface.companion` mood each voice state is, and the
 * rendering ceiling it gets. The overlay is small and sits over other apps, so the companion is
 * capped at the `low` tier (a lower viewer ceiling, or companions switched off, still win).
 */
import type { ModelStageQuality, SurfaceCompanionMood } from "@t3team/pack-ui/contract";

import type { CompanionPreferences } from "~/t3team/packs/t3team-CompanionSlot";
import type { VoiceUiState } from "./surface/t3team-voiceUiModel";

const VOICE_MOODS: Record<VoiceUiState, SurfaceCompanionMood | null> = {
  idle: null,
  preparing: "preparing",
  recording: "listening",
  transcribing: "transcribing",
  committed: "heard",
  failed: "failed",
  denied: "failed",
};

/** The companion mood for a voice state; `null` when there is no companion to show (idle). */
export function voiceCompanionMood(state: VoiceUiState): SurfaceCompanionMood | null {
  return VOICE_MOODS[state];
}

const CHEAPER_THAN_LOW: ReadonlySet<ModelStageQuality> = new Set(["minimal", "still"]);

/** The viewer's preferences with the overlay's `low` ceiling applied. */
export function voiceCompanionPreferences(viewer: CompanionPreferences): CompanionPreferences {
  return {
    enabled: viewer.enabled,
    quality: CHEAPER_THAN_LOW.has(viewer.quality) ? viewer.quality : "low",
  };
}
