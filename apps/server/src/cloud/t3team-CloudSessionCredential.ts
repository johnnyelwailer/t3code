import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type * as VcsProcess from "../vcs/VcsProcess.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import {
  apiArgs,
  type CloudSessionRepoRef,
  type GhInvocation,
} from "./t3team-githubActionsSessionClient.ts";

/**
 * The creator-side half of per-user T3 Connect credential handoff.
 *
 * Before a cloud session is dispatched, the creator's server hands its own
 * live connect credential to the session VM — one that carries the REFRESH
 * token, so a multi-hour session keeps refreshing rather than dying at the
 * access token's expiry. Delivery is a tag-keyed GitHub payload issue on the
 * fleet repo: the VM's `session.yml` reads the body once, seeds it into
 * `T3CODE_HOME`, and deletes the issue (in bash — this module never deletes).
 * It never logs the credential, only the issue number.
 *
 * The whole write is feature-flagged (owner rule): when the flag is off the
 * legacy shared-repo-secret path in `session.yml` remains the fallback.
 */

/** Environment override for the handoff flag. `1`/`true` on, `0`/`false` off. */
export const SESSION_CREDENTIAL_ISSUE_FLAG_ENV = "NEXI_FF_SESSION_CRED_ISSUE";

/** User-facing text for the `connect_sign_in_required` failure. */
export const CONNECT_SIGN_IN_REQUIRED_TEXT =
  "Sign in to T3 Connect on this machine to start a cloud session.";

/** User-facing text for the `payload_issue_failed` failure. */
export const PAYLOAD_ISSUE_FAILED_TEXT = "Could not prepare the session credential — try again.";

/**
 * Title prefix of a session's credential payload issue. The dispatch tag is
 * appended in brackets; the VM's lookup must match this byte for byte.
 */
export const PAYLOAD_ISSUE_TITLE_PREFIX = "nexi-session payload";

export const payloadIssueTitle = (tag: string): string => `${PAYLOAD_ISSUE_TITLE_PREFIX} [${tag}]`;

/**
 * Create the credential payload issue. The base64 credential rides on stdin
 * (`--input -`), never in argv, so it cannot surface in `ps` or a process
 * listing — the same hygiene the dispatch invocation in the client uses.
 */
export function createPayloadIssueInvocation(
  ref: CloudSessionRepoRef,
  input: { readonly title: string; readonly body: string },
): GhInvocation {
  return {
    args: [
      ...apiArgs(ref, `repos/${ref.owner}/${ref.repo}/issues`),
      "--method",
      "POST",
      "--input",
      "-",
    ],
    stdin: JSON.stringify({ title: input.title, body: input.body }),
  };
}

/** Read the `number` from a `POST /issues` response (name the issue, never its body). */
export function parseCreatedIssueNumber(stdout: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const number = (parsed as { number?: unknown }).number;
  return typeof number === "number" ? number : null;
}

/**
 * Is the per-session payload-issue handoff enabled? Reads the flag live so a
 * fleet can flip it without a rebuild. Unrecognized values default ON, which
 * is the safe direction: the legacy path is only a fallback, not the default.
 */
export const isSessionCredentialIssueEnabled = Effect.fn("cloud.session.credential_flag")(
  function* () {
    // `Effect.option` drops the ConfigError channel: the flag is read-only and a
    // malformed value is indistinguishable from "unset", so both default ON.
    const raw = yield* Effect.option(Config.string(SESSION_CREDENTIAL_ISSUE_FLAG_ENV));
    if (Option.isNone(raw)) return true;
    const normalized = raw.value.trim().toLowerCase();
    return !(normalized === "0" || normalized === "false");
  },
);

/**
 * Encode the creator's credential as the issue body. The body is base64 of the
 * full `PersistedToken` JSON — including the refresh token — so the VM's own
 * `CliTokenManager` can parse it and keep refreshing. Raw JSON would be
 * greppable out of repo logs; base64 keeps it inert until it is decoded inside
 * the VM.
 */
export const sessionCredentialPayloadBody = (token: CliTokenManager.PersistedToken): string =>
  Buffer.from(JSON.stringify(token), "utf8").toString("base64");

/**
 * The gh executor the handoff runs through: the service's error-mapped `run`,
 * so a gh failure already arrives as a `CloudSessionFailedError` and this
 * module only gives it the right reason.
 */
export type CredentialGhExecutor = (
  invocation: GhInvocation,
) => Effect.Effect<VcsProcess.VcsProcessOutput, CloudSessionFailedError>;

/**
 * Hand the creator's live credential to the session before dispatch. Resolves
 * the flag, reads the credential in-process (auto-refreshing near expiry via
 * `CliTokenManager.getExisting`), and writes the tag-keyed payload issue.
 *
 * - flag off  → no-op; the legacy secret path in `session.yml` takes over.
 * - no usable credential → `connect_sign_in_required`.
 * - issue write fails   → `payload_issue_failed` (any gh error collapses here,
 *   because the user's only next step is to retry).
 */
export const runCredentialHandoff = Effect.fn("cloud.session.credential_handoff")(
  function* (input: {
    readonly repoRef: CloudSessionRepoRef;
    readonly sessionTag: string;
    readonly run: CredentialGhExecutor;
    /** Whether the per-session handoff is enabled (flag read by the caller). */
    readonly enabled: boolean;
    /** The credential reader — `CliTokenManager.getExisting`, auto-refreshing. */
    readonly readCredential: Effect.Effect<
      Option.Option<CliTokenManager.PersistedToken>,
      CliTokenManager.CloudCliTokenManagerError
    >;
  }) {
    if (!input.enabled) return;

    // A stored credential that cannot be read or refreshed is treated as absent:
    // the user's remediation is the same either way — sign in (again). This keeps
    // the surface to the two handoff reasons rather than a third "refresh failed".
    const credential = yield* input.readCredential.pipe(
      Effect.orElseSucceed((): Option.Option<CliTokenManager.PersistedToken> => Option.none()),
    );
    if (Option.isNone(credential)) {
      return yield* new CloudSessionFailedError({
        reason: "connect_sign_in_required",
        message: CONNECT_SIGN_IN_REQUIRED_TEXT,
      });
    }

    const body = sessionCredentialPayloadBody(credential.value);
    const result = yield* input
      .run(
        createPayloadIssueInvocation(input.repoRef, {
          title: payloadIssueTitle(input.sessionTag),
          body,
        }),
      )
      .pipe(
        Effect.mapError(
          () =>
            new CloudSessionFailedError({
              reason: "payload_issue_failed",
              message: PAYLOAD_ISSUE_FAILED_TEXT,
            }),
        ),
      );

    // Log the issue number and nothing more: the number is safe, the body is not.
    const issueNumber = parseCreatedIssueNumber(result.stdout);
    if (issueNumber !== null) {
      yield* Effect.logInfo("Cloud session credential payload written to issue " + issueNumber);
    }
  },
);
