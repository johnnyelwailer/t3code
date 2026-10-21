/**
 * The host's `ModelStage` (`pack-ui:1`): picks a tier, then renders the still, the pre-rendered
 * loop, or the lazily loaded three.js canvas (`t3team-ModelStageCanvas.tsx`). This file imports
 * no three.js, so a surface that only ever shows a still or a loop never downloads it.
 *
 * The still is the poster at every tier: it shows while the renderer loads and the model decodes,
 * and the canvas fades in over it once its first frame is drawn.
 */
import type { ModelStageTier, PackModelStageProps } from "@t3team/pack-ui/contract";
import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";

import { useMediaQuery } from "~/hooks/useMediaQuery";

import { StageLoop } from "./t3team-ModelStageLoop";
import { selectModelStageTier } from "./t3team-modelStageTier";
import {
  hasWebGL,
  useBatteryState,
  useDesktopPowerState,
  useModelStageProbes,
} from "./t3team-modelStageSignals";

const ModelStageCanvas = lazy(() => import("./t3team-ModelStageCanvas"));

/** On screen and in a visible document: the only time a stage animates. */
function useStageVisible(element: HTMLElement | null): boolean {
  const [intersecting, setIntersecting] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (element === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries.at(-1);
      if (last) setIntersecting(last.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  // Without IntersectionObserver (old engines, tests) a mounted stage counts as on screen.
  return (intersecting || typeof IntersectionObserver === "undefined") && documentVisible;
}

export function ModelStage(props: PackModelStageProps) {
  const {
    src,
    still,
    loop,
    clips,
    oneShot,
    size,
    quality = "auto",
    label,
    yaw,
    onTierChange,
  } = props;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const battery = useBatteryState();
  const power = useDesktopPowerState();
  const probeMs = useModelStageProbes();
  const { tier, reasons } = selectModelStageTier(
    { reducedMotion, battery, power, probeMs, webgl: hasWebGL(), hasLoop: loop !== undefined },
    quality,
  );
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const visible = useStageVisible(element);
  // The canvas reports its first frame; until then (and after a tier change) the still shows.
  const [readyTier, setReadyTier] = useState<ModelStageTier | null>(null);

  useEffect(() => {
    onTierChange?.(tier);
  }, [onTierChange, tier]);

  const webglTier = tier === "full" || tier === "low" ? tier : null;
  const showPoster = webglTier === null ? tier === "still" : readyTier !== webglTier;
  const box: CSSProperties = { width: size, height: size };
  return (
    <div
      ref={setElement}
      className="relative shrink-0"
      style={box}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-model-stage-tier={tier}
      data-model-stage-reasons={reasons.join("; ") || undefined}
    >
      {showPoster ? (
        <img
          src={still}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-contain select-none"
        />
      ) : null}
      {tier === "minimal" && loop ? <StageLoop loop={loop} playing={visible} /> : null}
      {webglTier ? (
        <Suspense fallback={null}>
          <ModelStageCanvas
            key={webglTier}
            tier={webglTier}
            src={src}
            size={size}
            clips={clips}
            oneShot={oneShot ?? null}
            yaw={yaw ?? 0}
            visible={visible}
            onReady={() => setReadyTier(webglTier)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
