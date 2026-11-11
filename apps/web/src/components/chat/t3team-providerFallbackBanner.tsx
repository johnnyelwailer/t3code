"use client";

import { TriangleAlertIcon } from "lucide-react";

import type { ProviderSelectionFallback } from "../../t3team-providerSelectionFallback";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/**
 * Says so when the composer is not on the provider that was asked for. The one automatic swap
 * left (Nexplore AI) is allowed precisely because it can be shown: this strip names both
 * providers and puts the original one click away.
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
    description: `${fallback.requestedDisplayName} can't start on this machine`,
    actions: (
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
