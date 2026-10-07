import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";

import { PR_EXPLAINER_SPEEDS, type PrExplainerPlayerState } from "./t3team-usePrExplainerPlayer";

function holdLabel(player: PrExplainerPlayerState) {
  if (player.waitingForStep) return "Waiting for the next step…";
  if (player.playing && player.held) return "Paused while you look";
  return null;
}

/** Play/pause, prev/next, position and speed. ←/→ work anywhere in the player. */
export function PrExplainerControls({
  player,
  stepCount,
}: {
  player: PrExplainerPlayerState;
  stepCount: number;
}) {
  const nextSpeed =
    PR_EXPLAINER_SPEEDS[
      (PR_EXPLAINER_SPEEDS.indexOf(player.speed) + 1) % PR_EXPLAINER_SPEEDS.length
    ];
  const hold = holdLabel(player);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous step"
        disabled={player.index === 0}
        onClick={() => player.goAndPause(player.index - 1)}
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={player.playing ? "Pause tour" : "Play tour"}
        aria-pressed={player.playing}
        disabled={stepCount === 0}
        onClick={player.togglePlay}
      >
        {player.playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next step"
        disabled={player.index >= stepCount - 1}
        onClick={() => player.goAndPause(player.index + 1)}
      >
        <ChevronRightIcon />
      </Button>
      <span className="ml-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {stepCount === 0 ? "–" : `${player.index + 1} / ${stepCount}`}
      </span>
      <span
        className="min-w-0 flex-1 truncate pl-2 text-2xs text-muted-foreground"
        aria-live="polite"
      >
        {player.waitingForStep ? <Spinner size="xs" className="mr-1 inline" /> : null}
        {hold}
      </span>
      <Button
        variant="ghost-muted"
        size="xs"
        aria-label={`Speed ${player.speed}×. Change to ${nextSpeed}×`}
        onClick={() => player.setSpeed(nextSpeed ?? 1)}
      >
        <span className="tabular-nums">{player.speed}×</span>
      </Button>
    </div>
  );
}
