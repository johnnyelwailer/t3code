/**
 * Compact inline audio player for voice-note attachments in the thread.
 *
 * Deliberately NOT the native `<audio controls>` chrome: attachments render as
 * quiet single-line rows in the timeline, and a full browser player (or a
 * `<video>` box) is out of scale. This is one line: play/pause button, name,
 * elapsed/total time, and a thin seekable progress bar. The element itself is
 * hidden; all playback control is custom.
 */
import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState, type JSX, type PointerEvent } from "react";

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MessageAudioPlayer({
  src,
  label,
}: {
  readonly src: string;
  readonly label: string;
}): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  // Track the hidden element: pause on unmount or source change so a
  // scrolled-away note never keeps playing.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio === null) return;
    const onLoaded = () => setDuration(audio.duration);
    const onTime = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setProgress(audio.currentTime / audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  const seek = (event: PointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const track = trackRef.current;
    if (audio === null || track === null || !Number.isFinite(audio.duration)) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  };

  return (
    <div className="flex min-w-0 items-center gap-2 py-1 text-sm">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-foreground transition-colors hover:bg-accent/70 focus-visible:ring-ring/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
      >
        {playing ? (
          <PauseIcon className="size-3.5" />
        ) : (
          <PlayIcon className="size-3.5 translate-x-px" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate">{label}</span>
          <span className="shrink-0 text-xs tabular-nums text-secondary-label">
            {formatClock(progress * duration)} / {formatClock(duration)}
          </span>
        </div>
        <div
          ref={trackRef}
          role="slider"
          aria-label={`Seek ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onPointerDown={seek}
          className="mt-1 h-3 cursor-pointer"
        >
          <div className="mx-auto h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        aria-hidden="true"
        className="hidden"
      />
    </div>
  );
}
