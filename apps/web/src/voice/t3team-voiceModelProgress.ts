import type { DesktopVoiceModelProgress } from "@t3tools/contracts";

/** Whole percent of the model downloaded, clamped to 0-100; null while the total size is unknown. */
export function voiceModelProgressPercent(progress: DesktopVoiceModelProgress): number | null {
  const { receivedBytes, totalBytes } = progress;
  if (totalBytes === null || !(totalBytes > 0) || !Number.isFinite(receivedBytes)) return null;
  return Math.min(100, Math.max(0, Math.round((receivedBytes / totalBytes) * 100)));
}

/** What the pill says while preparing: a model download reports its percent, anything else stays generic. */
export function voicePreparingLabel(percent: number | null): string {
  return percent === null ? "Preparing voice input" : `Preparing voice model — ${percent}%`;
}
