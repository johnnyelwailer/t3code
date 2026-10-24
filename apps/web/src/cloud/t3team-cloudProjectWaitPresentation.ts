/**
 * The words for what the "Project ready" step waits on (`CloudProjectWait`) and how they escalate
 * with the time spent on the step: quiet at first, then what is expected, then that it is taking
 * longer than usual with the unmet condition and a copyable diagnostic. Pure; read by the steps
 * module (banner title, step detail) and the setup card.
 */
import type { CloudProjectWait, CloudProjectWaitReason } from "./t3team-cloudProjectWait";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

/** Seconds on the step before the card says what is expected. */
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
  /** What is expected, or after the long wait what is still missing; null at first. */
  readonly text: string | null;
  /** One copyable line for a bug report; only once the wait is long. */
  readonly diagnostic: string | null;
}

const quoted = (name: string) => `“${name}”`;
const nameOf = (wait: CloudProjectWait) =>
  wait.projectTitle === null ? "this project" : quoted(wait.projectTitle);
const machineNameOf = (wait: CloudProjectWait) =>
  wait.machineProjectTitle === null ? "project" : quoted(wait.machineProjectTitle);

/** The step's one-line detail for a reason. */
export function cloudProjectWaitDetail(wait: CloudProjectWait): string {
  switch (wait.reason) {
    case "machine-settings-pending":
      return "Waiting for the cloud machine to report its settings";
    case "scratch-opening":
      return "Opening the cloud machine's scratch folder";
    case "project-list-pending":
      return "Waiting for the cloud machine to send its project list";
    case "project-not-listed":
      return `Waiting for the cloud machine to list ${nameOf(wait)}`;
    case "different-repository":
      return `The machine's project ${machineNameOf(wait)} is a different repository than ${nameOf(wait)}`;
    case "different-folder":
      return `The machine's project ${machineNameOf(wait)} is not the folder of ${nameOf(wait)}`;
    case "no-matching-project":
      return wait.projectsSeen === 1
        ? `The machine's only project is not ${nameOf(wait)}`
        : `None of the machine's ${wait.projectsSeen} projects is ${nameOf(wait)}`;
  }
}

function expectedText(wait: CloudProjectWait): string {
  switch (wait.reason) {
    case "machine-settings-pending":
      return "Your message is sent once the machine answers this app's first request.";
    case "scratch-opening":
      return "This app opens the folder on the machine, then sends your message.";
    case "project-list-pending":
      return "A machine tells this app about its project as soon as it is connected, then your message is sent.";
    case "project-not-listed":
      return "The machine's server registers its working folder as its project when it starts; your message is sent as soon as it appears.";
    case "different-repository":
    case "different-folder":
      return "Your message is held until the machine has the project this draft belongs to.";
    case "no-matching-project":
      return "Your message is sent as soon as the machine lists this project.";
  }
}

function unmetText(wait: CloudProjectWait): string {
  switch (wait.reason) {
    case "machine-settings-pending":
      return "the machine has not reported its settings to this app";
    case "scratch-opening":
      return "the machine's scratch folder is not open";
    case "project-list-pending":
      return "this app lists no projects on the machine";
    case "project-not-listed":
      return `no project at ${wait.expectedCwd ?? "the machine's working folder"} is listed`;
    case "different-repository":
      return "the machine's project is not this repository";
    case "different-folder":
      return "the machine's project is not this project's folder";
    case "no-matching-project":
      return `no project on the machine is ${nameOf(wait)}`;
  }
}

/** The one-line diagnostic: reason, environment, expected folder and how many projects were seen. */
export function cloudProjectWaitDiagnostic(wait: CloudProjectWait): string {
  return `project-wait reason=${wait.reason} environment=${wait.environmentId} cwd=${wait.expectedCwd ?? "none"} projects=${wait.projectsSeen}`;
}

const BLOCKING: ReadonlySet<CloudProjectWaitReason> = new Set([
  "different-repository",
  "different-folder",
]);

/** The wording for a wait that has lasted `waitingSeconds`: quiet first, then what is expected, then what is missing. */
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
  const unmet = unmetText(wait);
  return {
    level,
    reason: wait.reason,
    detail: cloudProjectWaitDetail(wait),
    blocking: BLOCKING.has(wait.reason),
    text:
      level === "waiting"
        ? null
        : level === "expected"
          ? expectedText(wait)
          : `Taking longer than usual. Not yet true: ${unmet}. ${expectedText(wait)} You can cancel while you wait.`,
    diagnostic: level === "slow" ? cloudProjectWaitDiagnostic(wait) : null,
  };
}

/**
 * Seconds spent on the "project" step, from a clock that counts seconds since the send was
 * queued (the setup card's server-anchored one). Zero until the step has been stamped.
 */
export function cloudProjectWaitSeconds(
  queued: CloudQueuedSend | undefined,
  secondsSinceQueued: number,
): number {
  const started = queued?.stepStartedAt?.project;
  if (queued === undefined || started === undefined) return 0;
  const offset = (Date.parse(started) - Date.parse(queued.createdAt)) / 1000;
  return Math.max(0, secondsSinceQueued - (Number.isFinite(offset) ? offset : 0));
}
