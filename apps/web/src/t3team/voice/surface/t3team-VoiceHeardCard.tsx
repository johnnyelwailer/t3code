import { CheckIcon, ZapIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { VoiceTier } from "../t3team-voiceRouting";
import { VOICE_CLASS } from "./t3team-voiceClasses";
import { formatVoiceClock, voiceUiElapsedMs } from "./t3team-voiceUiModel";
import { useVoiceView } from "./t3team-voiceView";
import "~/t3team/voice/surface/t3team-voice.css";

const TIER_LABEL: Readonly<Record<VoiceTier, string>> = {
  control: "Fast · control",
  synthesis: "Considered · synthesis",
};

/** What was heard, how long it took to say, and which tier the router sent it to. */
export function VoiceHeardCard(props: { readonly compact?: boolean }) {
  const snapshot = useVoiceView((view) => view.snapshot);
  const { heardText, tier } = snapshot;
  return (
    <div
      data-testid="voice-heard-card"
      className={cn(VOICE_CLASS.scope, VOICE_CLASS.card, VOICE_CLASS.heardFresh)}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-medium font-mono text-2xs text-success-foreground uppercase tracking-wider">
          <CheckIcon className="size-3" aria-hidden />
          Heard
        </span>
        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
          {formatVoiceClock(voiceUiElapsedMs(snapshot, 0))}
        </span>
        {tier === null ? null : (
          <Badge variant="outline" size="sm" className="ml-auto">
            <ZapIcon aria-hidden />
            {TIER_LABEL[tier]}
          </Badge>
        )}
      </div>
      <p className={cn("text-foreground leading-normal", props.compact ? "text-sm" : "text-base")}>
        {heardText}
      </p>
    </div>
  );
}
