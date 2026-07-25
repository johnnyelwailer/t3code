import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { T3TeamErrorState } from "~/t3team/components/error/t3team-ErrorState";
import { Button } from "~/t3team/components/ui/t3team-button";
import { cn } from "~/t3team/lib/t3team-utils";
import { T3TeamImageLightboxNav, T3TeamImageLightboxToolbar } from "./t3team-ImageLightboxControls";
import type { T3TeamLightboxImage, T3TeamLightboxZoom } from "./t3team-imageLightboxState";

export type T3TeamImageLightboxProps = {
  readonly images: readonly T3TeamLightboxImage[];
  /** `undefined` closes the lightbox. */
  readonly index: number | undefined;
  readonly onClose: () => void;
  readonly onNext: () => void;
  readonly onPrev: () => void;
};

/**
 * Full-view lightbox for description/attachment images: a real modal dialog (focus-trapped,
 * labelled, Escape/backdrop/close-button dismissible via Base UI's `Dialog`), a fit-vs-actual
 * zoom toggle, an "open original" link, and arrow-key or on-screen prev/next when the gallery
 * has more than one image. Mounted only while an image is selected — nothing lingers in the DOM
 * (or in scroll-lock state) once closed, including after an error.
 */
export function T3TeamImageLightbox({
  images,
  index,
  onClose,
  onNext,
  onPrev,
}: T3TeamImageLightboxProps) {
  const titleId = useId();
  const [zoom, setZoom] = useState<T3TeamLightboxZoom>("fit");
  const [failed, setFailed] = useState(false);
  const image = index === undefined ? undefined : images[index];

  // A fresh image (including a fresh mount) always starts fit-to-screen and un-failed.
  useEffect(() => {
    setZoom("fit");
    setFailed(false);
  }, [image?.src]);

  if (image === undefined) return null;

  const total = images.length;
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    if (event.key === "ArrowRight") onNext();
    else if (event.key === "ArrowLeft") onPrev();
  };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/85 backdrop-blur-md" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-50 flex flex-col outline-none"
          onKeyDown={handleKeyDown}
          aria-labelledby={titleId}
        >
          <DialogPrimitive.Title id={titleId} className="sr-only">
            {total > 1 ? `Image ${index! + 1} of ${total}: ${image.alt}` : `Image: ${image.alt}`}
          </DialogPrimitive.Title>

          <div className="flex flex-1 items-center justify-center overflow-auto p-4">
            {failed ? (
              <T3TeamErrorState
                variant="inline"
                error={new Error("Failed to load image")}
                action="Load image"
                className="max-w-sm"
              />
            ) : (
              <img
                src={image.src}
                alt={image.alt}
                onError={() => setFailed(true)}
                className={cn(
                  "rounded-md",
                  zoom === "fit" ? "max-h-[85vh] max-w-[90vw] object-contain" : "max-w-none",
                )}
              />
            )}
          </div>

          {total > 1 ? <T3TeamImageLightboxNav onPrev={onPrev} onNext={onNext} /> : null}

          <T3TeamImageLightboxToolbar
            zoom={zoom}
            onToggleZoom={() => setZoom((current) => (current === "fit" ? "actual" : "fit"))}
            originalHref={image.href ?? image.src}
            positionLabel={total > 1 ? `${index! + 1} / ${total}` : undefined}
          />

          <DialogPrimitive.Close
            aria-label="Close image viewer"
            className="absolute top-3 end-3 z-10 bg-background/70 text-foreground backdrop-blur-sm hover:bg-background/90"
            render={<Button variant="ghost" size="icon" />}
          >
            <XIcon />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
