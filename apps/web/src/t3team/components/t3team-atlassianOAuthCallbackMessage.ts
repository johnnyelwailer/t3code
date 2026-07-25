export const ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE = "t3team-atlassian-oauth-callback" as const;

export type AtlassianOAuthCallbackMessage = {
  readonly type: typeof ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE;
  readonly href: string;
};

export function isAtlassianOAuthCallbackMessage(
  data: unknown,
  redirectUri: string,
): data is AtlassianOAuthCallbackMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as AtlassianOAuthCallbackMessage).type === ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE &&
    typeof (data as AtlassianOAuthCallbackMessage).href === "string" &&
    (data as AtlassianOAuthCallbackMessage).href.startsWith(redirectUri)
  );
}

export function postAtlassianOAuthCallbackToOpener(href: string): boolean {
  const opener = window.opener;
  if (!opener || opener.closed) {
    return false;
  }

  const message: AtlassianOAuthCallbackMessage = {
    type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
    href,
  };
  opener.postMessage(message, "*");
  return true;
}

/**
 * Same-origin channel used when there is no opener to post back to.
 *
 * A popup always has an opener, but the sign-in window is not always a popup: when the browser
 * blocks popups the user opens the authorize URL themselves, and depending on how they do it —
 * middle-click, "open in new tab", pasting the link — the new tab may have no opener at all. A
 * BroadcastChannel reaches the original tab regardless, because both ends are the same origin.
 */
export const ATLASSIAN_OAUTH_CALLBACK_CHANNEL = "t3team-atlassian-oauth";

export function broadcastAtlassianOAuthCallback(href: string): boolean {
  if (typeof BroadcastChannel === "undefined") return false;

  const message: AtlassianOAuthCallbackMessage = {
    type: ATLASSIAN_OAUTH_CALLBACK_MESSAGE_TYPE,
    href,
  };

  const channel = new BroadcastChannel(ATLASSIAN_OAUTH_CALLBACK_CHANNEL);
  try {
    // BroadcastChannel.postMessage takes no targetOrigin; the channel is same-origin by
    // construction, which is the guarantee that rule enforces for window.postMessage.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    channel.postMessage(message);
    return true;
  } finally {
    channel.close();
  }
}
