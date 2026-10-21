import { LoaderCircleIcon, MicIcon, MicOffIcon, SquareIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { voiceOrbLabel } from "./surface/t3team-VoiceOrb";
import type { VoiceUiState } from "./surface/t3team-voiceUiModel";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";

function MicGlyph({ state }: { readonly state: VoiceUiState }) {
  if (state === "recording") return <SquareIcon className="fill-current text-primary" />;
  if (state === "preparing" || state === "transcribing") {
    return <LoaderCircleIcon className="animate-spin" />;
  }
  return state === "denied" ? <MicOffIcon className="text-destructive" /> : <MicIcon />;
}

/**
 * The mic of the voice thread's composer. Where other threads dictate into the draft, this one
 * talks to the voice agent: it starts and stops the same recording the sidebar row controls, and
 * the composer's dock shows it.
 */
export function VoiceComposerMic() {
  const state = useVoiceUiStore((store) => store.snapshot.state);
  const controls = useVoiceUiStore((store) => store.controls);
  if (controls === null) return null;
  const busy = state === "preparing" || state === "transcribing";
  const label = voiceOrbLabel(state);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-testid="voice-composer-mic"
            data-state={state}
            disabled={busy}
            onPointerDown={(event) => event.preventDefault()}
            onClick={controls.toggle}
            aria-label={label}
          />
        }
      >
        <MicGlyph state={state} />
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
