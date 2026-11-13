"use client";

import { TriangleAlertIcon } from "lucide-react";

import type { ProviderSelectionFallback } from "../../t3team-providerSelectionFallback";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/**
 * Says so when the composer is not on the instance that was asked for: Nexplore AI, or another
 * account of the same provider. Both names are shown; for Nexplore AI the original is one click
 * away (a same-driver stand-in only happens because the original is off, so it has no button).
 * @module components/chat/providerFallbackBanner
 */
export function providerFallbackBannerItem({
  fallback,
  onUseRequested,
  onDismiss,
}: {
  readonly fallback: ProviderSelectionFallback;
  readonly onUseRequested: () => void;
  readonly onDismiss: () => void;
}): ComposerBannerStackItem {
  return {
    id: "provider-fallback",
    variant: "warning",
    icon: <TriangleAlertIcon />,
    title: `Using ${fallback.fallbackDisplayName}`,
    description:
      fallback.kind === "sameDriver"
        ? `${fallback.requestedDisplayName} is off on this machine. Same model.`
        : `${fallback.requestedDisplayName} can't start on this machine`,
    actions:
      fallback.kind === "sameDriver" ? undefined : (
        <Button
          size="xs"
          variant="ghost"
          data-testid="provider-fallback-use-requested"
          onClick={onUseRequested}
        >
          Use {fallback.requestedDisplayName}
        </Button>
      ),
    dismissLabel: `Dismiss ${fallback.fallbackDisplayName} notice`,
    onDismiss,
  };
}
