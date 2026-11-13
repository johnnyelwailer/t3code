import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";

import * as EnterpriseMedia from "../shared/t3team-gitHubEnterpriseMedia.ts";

import * as GitHubCredentials from "./GitHubCredentials.ts";
import * as UploadSigning from "./t3team-gitHubEnterpriseUploadSigning.ts";

/**
 * Only a host with a configured credential is fetched. Its token rides only on the host and its
 * `raw.` file host, and a fetch carrying it stays within the host and its subdomains. A signed
 * upload URL carries no token, so it may follow the host's hand-off to its object store.
 */
export interface EnterpriseMediaPlan {
  readonly url: string;
  readonly bearer: Redacted.Redacted<string> | null;
  readonly isCredentialedHost: (url: string) => boolean;
  readonly mayRedirectTo: (url: URL) => boolean;
}

function hostnameOf(url: string): string | null {
  return URL.parse(url)?.hostname.toLowerCase() ?? null;
}

/** The enterprise web host `hostname` serves media for, as its own or as its `raw.` file host. */
function enterpriseHostOf(hostname: string, isEnterprise: (host: string) => boolean) {
  const ofRaw = EnterpriseMedia.enterpriseHostOfRaw(hostname, isEnterprise);
  if (ofRaw !== null) return { host: ofRaw, raw: true };
  return isEnterprise(hostname) ? { host: hostname, raw: false } : null;
}

/**
 * Undefined for media that is not on an enterprise host, which GitHub.com's path fetches; null
 * for media on one that may not be fetched.
 */
export const make = Effect.fn("GitHubEnterpriseMediaPlan.make")(function* (
  isEnterprise: (host: string) => boolean = EnterpriseMedia.isGitHubEnterpriseMediaHost,
) {
  const credentials = yield* GitHubCredentials.GitHubCredentials;
  const signUpload = yield* UploadSigning.make;

  return Effect.fn("GitHubEnterpriseMediaPlan.plan")(function* (
    url: string,
  ): Effect.fn.Return<EnterpriseMediaPlan | null | undefined> {
    const target = URL.parse(url);
    const enterprise = target === null ? null : enterpriseHostOf(target.hostname, isEnterprise);
    if (target === null || enterprise === null) return undefined;
    const { host } = enterprise;
    const credential = yield* Effect.option(credentials.get(host));
    if (Option.isNone(credential)) return null;
    const withoutUserInfo = (next: URL) => next.username === "" && next.password === "";
    const within = (next: URL) =>
      withoutUserInfo(next) && (next.hostname === host || next.hostname.endsWith(`.${host}`));
    if (enterprise.raw) {
      return {
        url,
        bearer: credential.value.token,
        isCredentialedHost: (hop) => [host, `raw.${host}`].includes(hostnameOf(hop) ?? ""),
        mayRedirectTo: within,
      };
    }
    const signed = yield* signUpload(host, credential.value.token, target);
    const signedUrl = signed === null ? null : URL.parse(signed);
    if (signedUrl?.protocol !== "https:" || !signedUrl.hostname.endsWith(`.${host}`)) {
      return null;
    }
    return {
      url: signedUrl.href,
      bearer: null,
      isCredentialedHost: () => false,
      mayRedirectTo: withoutUserInfo,
    };
  });
});
