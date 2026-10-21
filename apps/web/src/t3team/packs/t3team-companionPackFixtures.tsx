/**
 * Fixture `surface.companion` packs, written as a distribution pack's `web/index.ts` would be:
 * only `@t3team/pack-ui` and `react`. A neutral "blob" companion fills My Work's empty and
 * loading placements and the voice overlay; a "grumpy" one claims a new thread and throws, to show a crashing companion
 * leaves the surface's own default in its place.
 *
 * Used by the companion tests and stories; not part of the app.
 */
import { defineWebActivate, type SurfaceCompanionProps } from "@t3team/pack-ui";

import type { PackWebActivation } from "./t3team-packWebHost";

const EDGE = { sm: 48, md: 120, lg: 200 } as const;

function BlobCompanion({ placement, mood, size, quality }: SurfaceCompanionProps) {
  const edge = EDGE[size];
  return (
    <svg
      data-fixture="blob-companion"
      data-placement={placement}
      data-mood={mood}
      data-quality={quality}
      width={edge}
      height={edge}
      viewBox="0 0 48 48"
      className="text-muted-foreground"
    >
      <ellipse cx="24" cy="28" rx="16" ry="14" fill="currentColor" opacity="0.25" />
      <circle cx="18" cy="26" r="2" fill="currentColor" />
      <circle cx="30" cy="26" r="2" fill="currentColor" />
      <path
        d={mood === "cleared" ? "M18 32 Q24 38 30 32" : "M19 33 Q24 35 29 33"}
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

export const blobCompanionPackWebModule: PackWebActivation = {
  packId: "blob",
  activate: defineWebActivate((context) => {
    context.registerView({
      slot: "surface.companion",
      id: "blob.companion",
      placements: ["myWork.empty", "myWork.loading", "voice.overlay"],
      component: BlobCompanion,
    });
  }),
};

function GrumpyCompanion(): never {
  throw new Error("grumpy companion refuses to render");
}

export const grumpyCompanionPackWebModule: PackWebActivation = {
  packId: "grumpy",
  activate: defineWebActivate((context) => {
    context.registerView({
      slot: "surface.companion",
      id: "grumpy.companion",
      placements: ["thread.new"],
      component: GrumpyCompanion,
    });
    // A second claim on My Work: the first registration (blob, activated first) wins.
    context.registerView({
      slot: "surface.companion",
      id: "grumpy.everywhere",
      component: GrumpyCompanion,
    });
  }),
};
