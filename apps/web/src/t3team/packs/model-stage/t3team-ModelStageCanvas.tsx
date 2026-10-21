/**
 * The lazily loaded WebGL half of `ModelStage` (`t3team-ModelStage.tsx`): a canvas bound to one
 * `ModelStageScene` for the life of a tier. A tier change remounts it (the parent keys it by tier),
 * so a renderer is never reconfigured in place.
 */
import type { ModelStageClips, ModelStageFlight, ModelStageLookAt } from "@t3team/pack-ui/contract";
import { useEffect, useEffectEvent, useState } from "react";

import type { StagePointer } from "./t3team-modelStagePointer";
import { ModelStageScene, loadModel, type WebGLTier } from "./t3team-modelStageScene";

export interface ModelStageCanvasProps {
  readonly tier: WebGLTier;
  readonly src: string;
  readonly size: number;
  readonly clips: ModelStageClips | undefined;
  readonly oneShot: { readonly clip: string; readonly key: number } | null;
  readonly yaw: number;
  readonly flight: ModelStageFlight | null;
  readonly groundShadow: boolean;
  readonly lookAt: ModelStageLookAt | null;
  readonly pointer: StagePointer;
  readonly visible: boolean;
  readonly onReady: () => void;
}

const clipsKey = (clips: ModelStageClips | undefined) =>
  clips === undefined ? "" : [clips].flat().join("\u0000");

export default function ModelStageCanvas(props: ModelStageCanvasProps) {
  const { tier, src, size, clips, oneShot, yaw, flight, groundShadow, lookAt, pointer, visible } =
    props;
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [scene, setScene] = useState<ModelStageScene | null>(null);
  const [headroom, setHeadroom] = useState(0);
  const [initialSize] = useState(size);
  const [initialYaw] = useState(yaw);
  const ready = useEffectEvent(() => props.onReady());

  useEffect(() => {
    if (canvas === null) return;
    let cancelled = false;
    const stage = new ModelStageScene(canvas, tier, initialSize);
    stage.onHeadroom = setHeadroom;
    loadModel(src, stage.webgl)
      .then((gltf) => {
        if (cancelled) return;
        stage.setModel(gltf, initialYaw);
        setScene(stage);
        ready();
      })
      .catch(() => {
        // The poster stays: a stage that cannot load is just its still.
      });
    return () => {
      cancelled = true;
      setScene(null);
      stage.dispose();
    };
  }, [canvas, tier, src, initialSize, initialYaw]);

  useEffect(() => scene?.setSize(size), [scene, size]);

  const sequence = clipsKey(clips);
  useEffect(() => {
    scene?.setClips(sequence === "" ? undefined : sequence.split("\u0000"));
  }, [scene, sequence]);

  const oneShotKey = oneShot?.key;
  const oneShotClip = oneShot?.clip;
  useEffect(() => {
    if (oneShotKey !== undefined && oneShotClip !== undefined) scene?.playOnce(oneShotClip);
  }, [scene, oneShotKey, oneShotClip]);

  useEffect(() => scene?.setFlight(flight), [scene, flight]);
  useEffect(() => scene?.setGroundShadow(groundShadow), [scene, groundShadow]);
  useEffect(() => scene?.setLookAt(lookAt, pointer), [scene, lookAt, pointer]);
  useEffect(() => scene?.setRunning(visible), [scene, visible]);

  return (
    <canvas
      ref={setCanvas}
      className="pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-300"
      style={{ width: size, height: size + headroom, opacity: scene ? 1 : 0 }}
    />
  );
}
