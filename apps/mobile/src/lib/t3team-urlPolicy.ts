import { mobileExtensions } from "../extensions/t3team-extensions";
import type { UrlPolicy } from "../extensions/t3team-extensionTypes";

/** A policy hook must never turn a good URL into a failure: a throwing hook means "no opinion". */
function ask<A>(read: (policy: UrlPolicy) => A | undefined): A | undefined {
  try {
    const policy = mobileExtensions.urlPolicy;
    return policy === undefined ? undefined : read(policy);
  } catch {
    return undefined;
  }
}

export const APP_PRIVATE_URL_MESSAGE = "This address only works inside this app.";

/**
 * True when the URL only works inside this app (never true in a stock build). A policy that
 * exists but throws while classifying fails closed: the URL is treated as private, so it is
 * never handed to an external app on the strength of a broken hook.
 */
export function isAppPrivateUrl(url: string): boolean {
  const policy = mobileExtensions.urlPolicy;
  if (policy?.isAppPrivate === undefined) return false;
  try {
    return policy.isAppPrivate(url) === true;
  } catch {
    return true;
  }
}

/** Shares `url` through `share` unless it is app-private; returns whether it was shared. */
export function shareUnlessPrivate(url: string, share: (message: string) => unknown): boolean {
  if (isAppPrivateUrl(url)) return false;
  void share(url);
  return true;
}

/** Tells the platform a native HTTP client is about to fetch `url`. */
export function beforeNativeFetch(url: string): void {
  ask((policy) => policy.beforeNativeFetch?.(url));
}

/** "Open in another app" for an asset URL: app-private URLs open through the policy instead. */
export async function openAssetLink(input: {
  readonly url: string;
  readonly attachment: { readonly name: string; readonly mimeType: string };
  readonly open: (url: string) => unknown;
  readonly report: (message: string) => void;
}): Promise<void> {
  if (!isAppPrivateUrl(input.url)) {
    await input.open(input.url);
    return;
  }
  const policy = mobileExtensions.urlPolicy;
  if (policy?.openAppPrivate === undefined) {
    input.report(APP_PRIVATE_URL_MESSAGE);
    return;
  }
  try {
    await policy.openAppPrivate({
      url: input.url,
      attachment: input.attachment,
      report: input.report,
    });
  } catch {
    // Never fall back to an external app for an app-private URL.
    input.report(APP_PRIVATE_URL_MESSAGE);
  }
}

/** The distribution's base URL for the stream document of an environment, if it has one. */
export function documentBaseUrlOverride(httpBase: string): string | undefined {
  return ask((policy) => policy.documentBaseUrl?.(httpBase));
}

/** The preview document's base URL, from the `access.httpBase` inside its JSON configuration. */
export function previewDocumentBaseUrl(configuration: string, fallback: string): string {
  try {
    const parsed: unknown = JSON.parse(configuration);
    const access =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { access?: unknown }).access
        : null;
    const httpBase =
      typeof access === "object" && access !== null
        ? (access as { httpBase?: unknown }).httpBase
        : null;
    return typeof httpBase === "string"
      ? (documentBaseUrlOverride(httpBase) ?? fallback)
      : fallback;
  } catch {
    return fallback;
  }
}
