/**
 * The host's `ModelStage` (`pack-ui:1`): picks a tier, then renders the still, the pre-rendered
 * loop, or the lazily loaded three.js canvas (`t3team-ModelStageCanvas.tsx`). This file imports
 * no three.js, so a surface that only ever shows a still or a loop never downloads it.
 *
 * The still is the poster at every tier: it shows while the renderer loads and the model decodes,
 * and the canvas fades in over it once its first frame is drawn. A CSS ellipse under the stage
 * stands in for the ground shadow at the `minimal`/`still` tiers (and while the canvas loads).
 */
import type { ModelStageTier, PackModelStageProps } from "@t3team/pack-ui/contract";
import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";

import { useMediaQuery } from "~/hooks/useMediaQuery";

import { StageLoop } from "./t3team-ModelStageLoop";
import { useStageInteraction } from "./t3team-modelStageInteraction";
import { useStagePointer } from "./t3team-modelStagePointer";
import { groundShadowCssOpacity } from "./t3team-modelStageShadow";
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
    flight = null,
    groundShadow = true,
    lookAt = null,
    interaction = null,
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
  const [readyTier, setReadyTier] = useState<ModelStageTier | null>(null);
  const control = useStageInteraction(element, interaction, size, reducedMotion);

  useEffect(() => {
    onTierChange?.(tier);
  }, [onTierChange, tier]);

  const webglTier = tier === "full" || tier === "low" ? tier : null;
  // Look-at only where it can render: a WebGL tier, on screen, motion allowed.
  const tracking = lookAt !== null && webglTier !== null && visible && !reducedMotion;
  const pointer = useStagePointer(element, tracking);
  const showPoster = webglTier === null ? tier === "still" : readyTier !== webglTier;
  // CSS shadow covers minimal/still and the loading poster; WebGL draws its own once ready.
  const cssShadow = groundShadow && (webglTier === null || showPoster);
  const shadowOpacity = groundShadowCssOpacity(flight, cssShadow);
  const airborne = (flight?.lift ?? 0) > 0.02;
  const box: CSSProperties = { width: size, height: size };
  const contentLift: CSSProperties | undefined =
    !webglTier && airborne
      ? {
          transform: `translateY(-${Math.round((flight?.lift ?? 0) * size * 0.35)}px)`,
          transition: reducedMotion ? undefined : "transform 400ms ease-out",
        }
      : undefined;

  return (
    <div
      ref={setElement}
      className={
        interaction
          ? "relative shrink-0 rounded-xl outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          : "relative shrink-0"
      }
      style={{ ...box, ...control.style }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label || interaction ? undefined : true}
      {...control.props}
      data-model-stage-held={control.held ? "1" : undefined}
      data-model-stage-tier={tier}
      data-model-stage-reasons={reasons.join("; ") || undefined}
      data-model-stage-flight={airborne ? "1" : undefined}
    >
      {shadowOpacity > 0 ? (
        <div
          aria-hidden
          data-model-stage-shadow
          className="pointer-events-none absolute left-1/2 rounded-full"
          style={{
            width: size * 0.7,
            height: size * 0.2,
            bottom: size * 0.04,
            transform: "translateX(-50%)",
            opacity: shadowOpacity,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 40%, transparent 70%)",
            transition: "opacity 300ms ease",
          }}
        />
      ) : null}
      <div className="absolute inset-0" style={contentLift}>
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
              flight={flight}
              groundShadow={groundShadow}
              lookAt={tracking ? lookAt : null}
              pointer={pointer}
              visible={visible}
              onReady={() => setReadyTier(webglTier)}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
