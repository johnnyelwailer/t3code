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
