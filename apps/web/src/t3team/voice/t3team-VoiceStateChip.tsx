import { ActivityIcon } from "lucide-react";

import { ContextChipShell } from "~/components/contextChipParts";

/**
 * Chip for the live-state snapshot the voice session attaches to every utterance. The record is a
 * free-form (payload) kind, so the timeline never resolves it and the chip is label-only.
 */
export function VoiceStateChip(props: { label: string; copyMarkdown: string }) {
  return (
    <ContextChipShell
      icon={<ActivityIcon />}
      label={props.label}
      aria-label={`Voice context, ${props.label}`}
      data-markdown-copy={props.copyMarkdown}
      tooltip="A snapshot of your active threads, attached to each voice message automatically."
    />
  );
}
