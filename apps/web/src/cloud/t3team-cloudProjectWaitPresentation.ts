/**
 * The words for what the "Project ready" step waits on (`CloudProjectWait`), escalating with the
 * time on the step: quiet, then a plain status sentence, then the same sentence with "taking
 * longer than usual". Visible copy carries no ids, folders or counts; those belong to the
 * diagnostic, which the card keeps behind a closed disclosure. Pure.
 */
import type { CloudProjectWait, CloudProjectWaitReason } from "./t3team-cloudProjectWait";

/** Seconds on the step before the card says what is going on. */
export const CLOUD_PROJECT_WAIT_EXPECTED_SECONDS = 15;
/** Seconds on the step before the card says it is taking longer than usual. */
export const CLOUD_PROJECT_WAIT_SLOW_SECONDS = 90;

export type CloudProjectWaitLevel = "waiting" | "expected" | "slow";

export interface CloudProjectWaitNotice {
  readonly level: CloudProjectWaitLevel;
  readonly reason: CloudProjectWaitReason;
  /** What the step is waiting on, as the step's detail and the banner title. */
  readonly detail: string;
  /** True when waiting alone cannot end it: the machine's project is not this project. */
  readonly blocking: boolean;
  /** The plain status sentence; null at first. */
  readonly text: string | null;
  /** One copyable line for a bug report; only once the wait is long, and never in visible copy. */
  readonly diagnostic: string | null;
}

const quoted = (name: string) => `“${name}”`;
const nameOf = (wait: CloudProjectWait) =>
  wait.projectTitle === null ? "this project" : quoted(wait.projectTitle);
const machineNameOf = (wait: CloudProjectWait) =>
  wait.machineProjectTitle === null
    ? "its own project"
    : `its project ${quoted(wait.machineProjectTitle)}`;

/** The step's one-line detail for a reason. */
export function cloudProjectWaitDetail(wait: CloudProjectWait): string {
  switch (wait.reason) {
    case "machine-settings-pending":
    case "project-list-pending":
      return "Connecting to the cloud machine";
    case "scratch-folder-unknown":
      return "The cloud machine has no folder to work in";
    case "scratch-opening":
      return "Opening a folder on the cloud machine";
    case "project-not-listed":
    case "no-matching-project":
      return `Waiting for ${nameOf(wait)} on the cloud machine`;
    case "different-repository":
      return "The cloud machine is working in a different repository";
    case "different-folder":
      return "The cloud machine is working in a different folder";
  }
}

/** One plain sentence: what is going on, and what happens to the message next. */
function statusText(wait: CloudProjectWait): string {
  switch (wait.reason) {
    case "machine-settings-pending":
    case "project-list-pending":
      return "Still connecting to the cloud machine. Your message sends when it's ready.";
    case "scratch-opening":
      return "Opening a folder on the cloud machine. Your message sends when it's ready.";
    case "project-not-listed":
    case "no-matching-project":
      return `Waiting for ${nameOf(wait)} on the cloud machine. Your message sends as soon as it is there.`;
    case "scratch-folder-unknown":
      return "The cloud machine has no folder to work in. Send your message in its own project, or cancel to choose another machine.";
    case "different-repository":
      return `The cloud machine is working in a different repository. Send your message in ${machineNameOf(wait)}, or cancel to choose another machine.`;
    case "different-folder":
      return `The cloud machine is working in a different folder. Send your message in ${machineNameOf(wait)}, or cancel to choose another machine.`;
  }
}

/** The body of the card for a send that stopped waiting: plain, and never a dead end. */
export function cloudProjectWaitParkedMessage(wait: CloudProjectWait): string {
  switch (wait.reason) {
    case "scratch-folder-unknown":
      return "The cloud machine has no folder to work in. Your message is saved.";
    case "different-repository":
      return "The cloud machine is working in a different repository. Your message is saved.";
    case "different-folder":
      return "The cloud machine is working in a different folder. Your message is saved.";
    case "machine-settings-pending":
    case "project-list-pending":
    case "scratch-opening":
    case "project-not-listed":
    case "no-matching-project":
      return `The cloud machine hasn't opened ${nameOf(wait)} yet. Your message is saved.`;
  }
}

/** The one-line diagnostic: reason, environment, expected folder and how many projects were seen. */
export function cloudProjectWaitDiagnostic(wait: CloudProjectWait): string {
  return `project-wait reason=${wait.reason} environment=${wait.environmentId} cwd=${wait.expectedCwd ?? "none"} projects=${wait.projectsSeen}`;
}

const BLOCKING: ReadonlySet<CloudProjectWaitReason> = new Set([
  "scratch-folder-unknown",
  "different-repository",
  "different-folder",
]);

/** The wording for a wait that has lasted `waitingSeconds`: quiet first, then the status sentence. */
export function presentCloudProjectWait(
  wait: CloudProjectWait,
  waitingSeconds: number,
): CloudProjectWaitNotice {
  const level: CloudProjectWaitLevel =
    waitingSeconds >= CLOUD_PROJECT_WAIT_SLOW_SECONDS
      ? "slow"
      : waitingSeconds >= CLOUD_PROJECT_WAIT_EXPECTED_SECONDS
        ? "expected"
        : "waiting";
  const blocking = BLOCKING.has(wait.reason);
  const status = statusText(wait);
  return {
    level,
    reason: wait.reason,
    detail: cloudProjectWaitDetail(wait),
    blocking,
    text:
      level === "waiting"
        ? null
        : // A blocked wait is not slow, it is stuck: the status sentence already says so.
          level === "slow" && !blocking
          ? `This is taking longer than usual. ${status}`
          : status,
    diagnostic: level === "slow" ? cloudProjectWaitDiagnostic(wait) : null,
  };
}
