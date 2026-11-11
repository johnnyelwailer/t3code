/**
 * Every way install-and-connect can fail, in plain words with a next step. The server's
 * `ToolAuthState.message` is the CLI's or npm's own text, right for a log line and wrong as the
 * only thing a user reads; this table answers a typed reason instead, naming the machine.
 * @module state/toolAuthFailureMessage
 */
import type { ToolAuthFailureReason } from "@t3tools/contracts";

/** Reasons no server state can carry: the request itself never got that far. */
export type ToolAuthClientFailureReason =
  /** No environment to run on — a cloud session that has not come up yet. */
  | "noEnvironment"
  /** The call was accepted and nothing came back within the card's patience window. */
  | "noResponse"
  /**
   * `ToolAuthSpawnError` — the process could not be started at all. Also how a per-host CLI
   * refusing a host other than its own arrives, since that is the error it raises.
   */
  | "spawnFailed"
  /** `ToolAuthNoActiveSessionError` — the flow being answered is already gone. */
  | "noActiveSession"
  /** `ToolAuthNotAwaitingCodeError` — a code arrived for a flow that is not asking for one. */
  | "notAwaitingCode"
  /** The connection to the machine dropped mid-request. */
  | "offline"
  /** Anything else the transport reported. */
  | "requestFailed";

export type ToolAuthFailureKind = ToolAuthFailureReason | ToolAuthClientFailureReason;

export interface ToolAuthFailureCopy {
  /** One sentence: what happened, and on which machine. */
  readonly message: string;
  /** What to do about it. Absent when Retry on its own is the whole answer. */
  readonly nextStep?: string;
  /** Whether retrying the same action can plausibly work. */
  readonly retryable: boolean;
}

export interface ToolAuthFailureContext {
  /** The provider's display name, e.g. `Claude Code`. */
  readonly label: string;
  /** The machine the flow runs on, e.g. `this cloud machine`. */
  readonly machine: string;
}

type CopyBuilder = (context: ToolAuthFailureContext) => ToolAuthFailureCopy;

const FAILURE_COPY: Record<ToolAuthFailureKind, CopyBuilder> = {
  featureDisabled: ({ label, machine }) => ({
    message: `${label} sign-in isn't enabled on ${machine} yet.`,
    nextStep: `Turn on CLI tool sign-in for ${machine}, or sign ${label} in from its terminal.`,
    retryable: false,
  }),
  notInstalled: ({ label, machine }) => ({
    message: `${label} isn't installed on ${machine}.`,
    nextStep: "Install and connect installs it for you.",
    retryable: true,
  }),
  installFailed: ({ label, machine }) => ({
    message: `Installing ${label} on ${machine} didn't finish.`,
    nextStep: "Retry, or install it from the machine's terminal if it keeps failing.",
    retryable: true,
  }),
  installTimedOut: ({ label, machine }) => ({
    message: `Installing ${label} on ${machine} took too long and was stopped.`,
    nextStep: "Retry when the machine is less busy.",
    retryable: true,
  }),
  signInFailed: ({ label }) => ({
    message: `${label} did not accept the sign-in.`,
    nextStep: "Retry and approve it in the browser, then paste the code back here.",
    retryable: true,
  }),
  credentialExpired: ({ label, machine }) => ({
    message: `${label}'s sign-in on ${machine} has expired.`,
    nextStep: "Reconnect to sign in again.",
    retryable: true,
  }),
  noEnvironment: ({ machine }) => ({
    message: `${machine} isn't ready to run this yet.`,
    nextStep: "Wait for the machine to come up, then try again.",
    retryable: true,
  }),
  noResponse: ({ label, machine }) => ({
    message: `${machine} hasn't answered the request to set up ${label}.`,
    nextStep: "Retry, or check the machine is still connected.",
    retryable: true,
  }),
  spawnFailed: ({ label, machine }) => ({
    message: `${machine} could not start ${label}.`,
    nextStep: "Retry, or sign in from the machine's terminal.",
    retryable: true,
  }),
  noActiveSession: ({ label }) => ({
    message: `The ${label} sign-in is no longer running.`,
    nextStep: "Start it again.",
    retryable: true,
  }),
  notAwaitingCode: ({ label }) => ({
    message: `${label} isn't waiting for a code right now.`,
    nextStep: "Start the sign-in again and use the code it shows.",
    retryable: true,
  }),
  offline: ({ machine }) => ({
    message: `The connection to ${machine} dropped.`,
    nextStep: "Reconnect, then try again.",
    retryable: true,
  }),
  requestFailed: ({ label, machine }) => ({
    message: `${machine} could not set up ${label}.`,
    retryable: true,
  }),
};

/** `machine` and `label` both start sentences, and only one of them is already capitalised. */
const asSentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Falls back to `requestFailed` for a reason a newer server knows and this client does not. */
export function toolAuthFailureCopy(
  reason: ToolAuthFailureKind | undefined,
  context: ToolAuthFailureContext,
): ToolAuthFailureCopy {
  const copy = (FAILURE_COPY[reason as ToolAuthFailureKind] ?? FAILURE_COPY.requestFailed)(context);
  return { ...copy, message: asSentence(copy.message) };
}

/** The card's single line: the sentence, then the next step when there is one worth adding. */
export function toolAuthFailureText(
  reason: ToolAuthFailureKind | undefined,
  context: ToolAuthFailureContext,
): string {
  const copy = toolAuthFailureCopy(reason, context);
  return copy.nextStep === undefined ? copy.message : `${copy.message} ${copy.nextStep}`;
}
