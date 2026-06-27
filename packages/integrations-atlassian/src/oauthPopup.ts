export const ATLASSIAN_OAUTH_POPUP_FRAME_NAME = "atlassian-oauth";

export const ATLASSIAN_OAUTH_POPUP_WIDTH = 500;
export const ATLASSIAN_OAUTH_POPUP_HEIGHT = 600;

export function isAtlassianOAuthAuthorizeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "auth.atlassian.com" &&
      parsed.pathname === "/authorize"
    );
  } catch {
    return false;
  }
}

export function isAtlassianOAuthPopupRequest(input: {
  readonly url: string;
  readonly frameName?: string;
}): boolean {
  if (input.frameName === ATLASSIAN_OAUTH_POPUP_FRAME_NAME) {
    return true;
  }
  return isAtlassianOAuthAuthorizeUrl(input.url);
}
