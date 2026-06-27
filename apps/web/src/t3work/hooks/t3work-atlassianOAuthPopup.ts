import { ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE } from "~/t3work/components/t3work-atlassianOAuthCallbackMessage";
import {
  ATLASSIAN_OAUTH_POPUP_FRAME_NAME,
  ATLASSIAN_OAUTH_POPUP_HEIGHT,
  ATLASSIAN_OAUTH_POPUP_WIDTH,
} from "@t3tools/integrations-atlassian";

const POLL_INTERVAL_MS = 500;

export { ATLASSIAN_OAUTH_POPUP_FRAME_NAME };

export function buildOAuthPopupFeatures(): string {
  const left = Math.round(window.screenX + (window.outerWidth - ATLASSIAN_OAUTH_POPUP_WIDTH) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - ATLASSIAN_OAUTH_POPUP_HEIGHT) / 2);
  return `width=${ATLASSIAN_OAUTH_POPUP_WIDTH},height=${ATLASSIAN_OAUTH_POPUP_HEIGHT},left=${left},top=${top}`;
}

export function openOAuthPopup(url: string): WindowProxy | null {
  return window.open(url, ATLASSIAN_OAUTH_POPUP_FRAME_NAME, buildOAuthPopupFeatures());
}

export function waitForOAuthCallback(
  popup: WindowProxy,
  redirectUri: string,
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let resolved = false;

    const cleanup = () => {
      resolved = true;
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
      if (!popup.closed) popup.close();
    };

    const onMessage = (event: MessageEvent) => {
      if (resolved || event.source !== popup) return;
      const data = event.data;
      if (
        data?.type === ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE &&
        typeof data.href === "string" &&
        data.href.startsWith(redirectUri)
      ) {
        cleanup();
        resolve(data.href);
      }
    };

    window.addEventListener("message", onMessage);

    const timer = setInterval(() => {
      if (resolved) return;

      if (popup.closed) {
        cleanup();
        reject(new Error("OAuth popup was closed before completing sign in."));
        return;
      }

      try {
        const href = popup.location.href;
        if (href && href.startsWith(redirectUri)) {
          cleanup();
          resolve(href);
        }
      } catch {
        // Cross-origin while on auth domain or callback host; ignore.
      }

      if (Date.now() - start > timeoutMs) {
        cleanup();
        reject(new Error("OAuth sign in timed out. Please try again."));
      }
    }, POLL_INTERVAL_MS);
  });
}
