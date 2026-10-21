/**
 * The `minimal` tier of `ModelStage`: the pack's pre-rendered loop, as a muted video or a sprite
 * sheet stepped on a timer, paused whenever the stage is.
 */
import type { ModelStageLoop } from "@t3team/pack-ui/contract";
import { useEffect, useState } from "react";

/** The `minimal` tier: a looping video or sprite sheet, paused with the stage. */
export function StageLoop({ loop, playing }: { loop: ModelStageLoop; playing: boolean }) {
  return loop.kind === "video" ? (
    <StageVideo src={loop.src} playing={playing} />
  ) : (
    <StageSprite loop={loop} playing={playing} />
  );
}

function StageVideo({ src, playing }: { src: string; playing: boolean }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (video === null) return;
    if (playing) void video.play().catch(() => {});
    else video.pause();
  }, [playing, video]);
  return (
    <video
      ref={setVideo}
      src={src}
      muted
      loop
      playsInline
      preload="auto"
      className="pointer-events-none absolute inset-0 size-full object-contain"
    />
  );
}

function StageSprite({
  loop,
  playing,
}: {
  loop: Extract<ModelStageLoop, { kind: "sprite" }>;
  playing: boolean;
}) {
  const { src, columns, rows, fps } = loop;
  const frames = loop.frames ?? columns * rows;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!playing || frames < 2) return;
    const timer = window.setInterval(() => setFrame((f) => (f + 1) % frames), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [playing, frames, fps]);
  const column = frame % columns;
  const row = Math.floor(frame / columns);
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `url(${JSON.stringify(src)})`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${columns > 1 ? (column / (columns - 1)) * 100 : 0}% ${
          rows > 1 ? (row / (rows - 1)) * 100 : 0
        }%`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
