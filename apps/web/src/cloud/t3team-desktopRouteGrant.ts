import { CredentialRequestError, credentialRequest } from "~/account/t3team-credentialRequest";
import { toastManager } from "../components/ui/toast";
import type { DesktopRouteGrant } from "./t3team-desktopRouteCapture";

const HOST_SERVICE = "/api/t3team/host-services/nexplore-global.desktop-route";

/** Makes the grant on THIS desktop's host service and always says how it went; true when made. */
export async function postDesktopRouteGrant(grant: DesktopRouteGrant): Promise<boolean> {
  try {
    await credentialRequest("POST", `${HOST_SERVICE}/grant`, {
      fallbackReason: "host_service_failed",
      body: grant,
    });
    toastManager.add({
      type: "success",
      title: `Routing ${grant.target} through this computer`,
      description:
        grant.scope === "once"
          ? "Once."
          : grant.scope === "session"
            ? "For this session."
            : "Always, for this host.",
    });
    return true;
  } catch (error) {
    toastManager.add({
      type: "error",
      title: "Desktop route not set up",
      description:
        error instanceof CredentialRequestError || error instanceof Error
          ? error.message
          : "The desktop could not make the grant.",
    });
    return false;
  }
}
