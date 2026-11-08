/// <reference types="vite/client" />

declare const __ATLASSIAN_CLIENT_ID__: string;
declare const __ATLASSIAN_SITE_URL__: string;
declare const __ATLASSIAN_OAUTH_REDIRECT_URI__: string;
/** Ports with a registered Atlassian callback; null/undefined when the build does not check. */
declare const __T3TEAM_ATLASSIAN_CALLBACK_PORTS__: readonly number[] | null | undefined;

interface ImportMetaEnv {
  readonly VITE_WS_URL: string;
  readonly VITE_HTTP_URL: string;
  readonly VITE_DEV_SERVER_URL?: string;
  readonly VITE_ATLASSIAN_OAUTH_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
