import {
  ATLASSIAN_OAUTH_CALLBACK_CHANNEL,
  isAtlassianOAuthCallbackMessage,
} from "~/t3team/components/t3team-atlassianOAuthCallbackMessage";
import {
  ATLASSIAN_OAUTH_POPUP_FRAME_NAME,
  ATLASSIAN_OAUTH_POPUP_HEIGHT,
  ATLASSIAN_OAUTH_POPUP_WIDTH,
} from "@t3tools/integrations-atlassian";

const POLL_INTERVAL_MS = 500;
/** Cross-origin postMessage can arrive after the popup closes (desktop custom protocol). */
const POPUP_CLOSED_GRACE_MS = 2000;

export { ATLASSIAN_OAUTH_POPUP_FRAME_NAME };

export function buildOAuthPopupFeatures(): string {
  const left = Math.round(window.screenX + (window.outerWidth - ATLASSIAN_OAUTH_POPUP_WIDTH) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - ATLASSIAN_OAUTH_POPUP_HEIGHT) / 2);
  return `width=${ATLASSIAN_OAUTH_POPUP_WIDTH},height=${ATLASSIAN_OAUTH_POPUP_HEIGHT},left=${left},top=${top}`;
}

export function openOAuthPopup(url: string): WindowProxy | null {
  return window.open(url, ATLASSIAN_OAUTH_POPUP_FRAME_NAME, buildOAuthPopupFeatures());
}

function acceptOAuthCallbackMessage(event: MessageEvent, redirectUri: string): string | null {
  if (!isAtlassianOAuthCallbackMessage(event.data, redirectUri)) {
    return null;
  }
  return event.data.href;
}

/**
 * Waits for the sign-in window to come back with an authorization code.
 *
 * `popup` is optional: when the browser blocks the popup, the user opens the authorize URL in an
 * ordinary tab and there is no window handle to poll or to detect closing. In that case the result
 * arrives over the same-origin broadcast channel instead, and the only limit is the timeout.
 */
export function waitForOAuthCallback(
  popup: WindowProxy | null,
  redirectUri: string,
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let resolved = false;
    let popupClosedPolls = 0;
    const closedGracePolls = Math.ceil(POPUP_CLOSED_GRACE_MS / POLL_INTERVAL_MS);
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(ATLASSIAN_OAUTH_CALLBACK_CHANNEL);

    const cleanup = () => {
      resolved = true;
      window.removeEventListener("message", onMessage);
      if (channel) {
        channel.removeEventListener("message", onMessage);
        channel.close();
      }
      clearInterval(timer);
      if (popup && !popup.closed) popup.close();
    };

    const onMessage = (event: MessageEvent) => {
      if (resolved) return;
      const href = acceptOAuthCallbackMessage(event, redirectUri);
      if (href) {
        cleanup();
        resolve(href);
      }
    };

    window.addEventListener("message", onMessage);
    channel?.addEventListener("message", onMessage);

    const timer = setInterval(() => {
      if (resolved) return;

      // Without a window handle there is nothing to poll; the broadcast channel delivers instead.
      if (popup) {
        if (popup.closed) {
          popupClosedPolls += 1;
          if (popupClosedPolls >= closedGracePolls) {
            cleanup();
            reject(new Error("OAuth popup was closed before completing sign in."));
          }
          return;
        }

        popupClosedPolls = 0;

        try {
          const href = popup.location.href;
          if (href && href.startsWith(redirectUri)) {
            cleanup();
            resolve(href);
          }
        } catch {
          // Cross-origin while on auth domain or callback host; ignore.
        }
      }

      if (Date.now() - start > timeoutMs) {
        cleanup();
        reject(new Error("OAuth sign in timed out. Please try again."));
      }
    }, POLL_INTERVAL_MS);
  });
}
