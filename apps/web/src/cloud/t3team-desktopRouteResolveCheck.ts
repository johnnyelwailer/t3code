import { credentialRequest } from "~/account/t3team-credentialRequest";

const HOST_SERVICE = "/api/t3team/host-services/nexplore-global.desktop-route";

/**
 * Asks this computer's desktop route whether it resolves `target`. Null when it can't say (an
 * older route service, the flag off, a timeout), so the card then shows nothing extra.
 */
export async function desktopRouteTargetResolves(target: string): Promise<boolean | null> {
  try {
    const result = await credentialRequest<{ readonly resolves?: unknown }>(
      "GET",
      `${HOST_SERVICE}/resolve/${encodeURIComponent(target)}`,
      { fallbackReason: "host_service_failed", timeoutMs: 8_000 },
    );
    return typeof result.resolves === "boolean" ? result.resolves : null;
  } catch {
    return null;
  }
}
