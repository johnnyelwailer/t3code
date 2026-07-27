import {
  ATLASSIAN_OAUTH_CALLBACK_CHANNEL,
  isAtlassianOAuthCallbackMessage,
} from "~/t3team/components/t3team-atlassianOAuthCallbackMessage";
import {
  ATLASSIAN_OAUTH_FLOW_TTL_MS,
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

export const OAUTH_POPUP_CLOSED_MESSAGE = "OAuth popup was closed before completing sign in.";

/**
 * Said in the words the user can act on, and true of both ends at once: the server forgets the
 * pending flow on the same `ATLASSIAN_OAUTH_FLOW_TTL_MS` schedule this wait gives up on.
 */
export const OAUTH_SIGNIN_EXPIRED_MESSAGE =
  "The Atlassian sign-in link expired. Start again from T3 Code.";

/**
 * A closed popup is not a failed sign-in — the user simply has not signed in yet, exactly as if the
 * popup had never been allowed to open. Callers need to tell it apart from a real timeout so they can
 * offer the link again instead of showing an error, so it carries a tag rather than only a message.
 */
export class AtlassianOAuthPopupClosedError extends Error {
  readonly kind = "popup_closed" as const;

  constructor() {
    super(OAUTH_POPUP_CLOSED_MESSAGE);
    this.name = "AtlassianOAuthPopupClosedError";
  }
}

export function isAtlassianOAuthPopupClosedError(error: unknown): boolean {
  return (
    error instanceof AtlassianOAuthPopupClosedError ||
    (error instanceof Error && error.message === OAUTH_POPUP_CLOSED_MESSAGE)
  );
}

function acceptOAuthCallbackMessage(event: MessageEvent, redirectUri: string): string | null {
  /*
    Origin check first, before the payload is looked at.

    The shape check and the redirect-URI prefix are both attacker-forgeable — any document able to
    reach this window could post a message carrying an href that starts with our redirect URI, and
    we would have handed its `code` and `state` straight to the token exchange. That defeats the
    CSRF protection `state` exists to provide.

    Both real senders are same-origin: the callback page posts to `window.opener`, and the
    no-opener path uses a BroadcastChannel, which is same-origin by construction and reports this
    page's origin here.
  */
  if (event.origin !== window.location.origin) {
    return null;
  }
  if (!isAtlassianOAuthCallbackMessage(event.data, redirectUri)) {
    return null;
  }
  return event.data.href;
}

/**
 * Waits for the sign-in window to come back with an authorization code.
 *
 * `popup` is optional: when the browser blocks the popup, or the user closed it and is opening the
 * link themselves, there is no window handle to poll or to detect closing. In that case the result
 * arrives over the same-origin broadcast channel instead, and the only limit is the timeout.
 *
 * The default timeout is the shared flow TTL, so this gives up at the same moment the server forgets
 * the pending `state` — never before it (waiting for something that can no longer succeed) and never
 * after it (giving up on something that still could).
 */
export function waitForOAuthCallback(
  popup: WindowProxy | null,
  redirectUri: string,
  timeoutMs = ATLASSIAN_OAUTH_FLOW_TTL_MS,
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
            reject(new AtlassianOAuthPopupClosedError());
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
        reject(new Error(OAUTH_SIGNIN_EXPIRED_MESSAGE));
      }
    }, POLL_INTERVAL_MS);
  });
}
