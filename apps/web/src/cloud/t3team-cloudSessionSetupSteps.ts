/**
 * The vocabulary of "Setting up your cloud session": which steps a session of each shape goes
 * through, their words, and the fallback timing used until the server has a measurement. Pure.
 */
import type { CloudSession, CloudSessionTiming } from "@t3tools/contracts";

export type CloudSetupShape = "plain" | "machine" | "setup";

export type CloudSetupStepId =
  | "reserve"
  | "workspace"
  | "fetch"
  | "build"
  | "check"
  | "install"
  | "start"
  | "connect"
  | "deliver";

/** Where in the run's timeline a step begins; the keys of `CloudSessionTiming.startsAtSeconds`. */
export type TimingMark = keyof CloudSessionTiming["startsAtSeconds"];

export interface StepDefinition {
  readonly id: CloudSetupStepId;
  /** The step list's row: short, a user's words, no pipeline jargon. */
  readonly label: string;
  /** One calm sentence under the headline while this step is the current one. */
  readonly activity: string;
  readonly mark: TimingMark | null;
}

export const STEP: Record<CloudSetupStepId, StepDefinition> = {
  reserve: {
    id: "reserve",
    label: "Reserving a machine",
    activity: "Waiting for a free machine in the cloud.",
    mark: null,
  },
  workspace: {
    id: "workspace",
    label: "Preparing your workspace",
    activity: "Setting up a clean workspace with everything Nexi needs.",
    mark: "preparing",
  },
  fetch: {
    id: "fetch",
    label: "Fetching your repository",
    activity: "Downloading your project's code onto the machine.",
    mark: "preparing",
  },
  build: {
    id: "build",
    label: "Building your project's machine",
    activity: "Installing the tools and dependencies your project needs.",
    mark: "building",
  },
  check: {
    id: "check",
    label: "Checking the machine",
    activity: "Making sure everything your project needs is in place.",
    mark: "checking",
  },
  install: {
    id: "install",
    label: "Installing Nexi",
    activity: "Adding Nexi to your project's machine.",
    mark: "installing",
  },
  start: {
    id: "start",
    label: "Starting Nexi",
    activity: "Bringing Nexi up on the machine.",
    mark: "starting",
  },
  connect: {
    id: "connect",
    label: "Connecting",
    activity: "Opening a secure connection from this app.",
    mark: null,
  },
  deliver: {
    id: "deliver",
    label: "Sending your message",
    activity: "Handing your first message to the machine.",
    mark: null,
  },
};

export const STEP_IDS_BY_SHAPE: Record<CloudSetupShape, readonly CloudSetupStepId[]> = {
  plain: ["reserve", "workspace", "start", "connect"],
  // A setup session checks the project out on the host so an agent can write its machine.
  setup: ["reserve", "fetch", "start", "connect"],
  machine: ["reserve", "fetch", "build", "check", "install", "start", "connect"],
};

/** The progress bar's ceiling until the session is truly ready: never claim "done" early. */
export const CLOUD_SETUP_PROGRESS_CEILING = 0.96;
/** Where "connecting" may creep to, and then "sending" (the last pending step). */
export const CONNECT_STEP_CEILING = 0.985;
export const FINAL_STEP_CEILING = 0.99;
/** The final steps (connecting, sending) have no mark of their own; they take about this long. */
export const FINAL_STEP_SECONDS = 8;
/**
 * Fallback timing, seconds from dispatch, used when the server has no measurement.
 *  - plain: measured 2026-10-24 on the fleet (run 348514897): ready ~83 s, a second session on the
 *    same workspace ~49 s. The range is deliberately wider than the samples.
 *  - machine / setup: NOT yet measured here; wide, honest ranges that say "several minutes".
 */
export const FALLBACK_TIMING: Record<CloudSetupShape, CloudSessionTiming> = {
  plain: {
    samples: 0,
    scope: "shape",
    readyLowSeconds: 55,
    readyTypicalSeconds: 85,
    readyHighSeconds: 150,
    startsAtSeconds: { preparing: 13, starting: 62 },
  },
  setup: {
    samples: 0,
    scope: "shape",
    readyLowSeconds: 100,
    readyTypicalSeconds: 180,
    readyHighSeconds: 420,
    startsAtSeconds: { preparing: 13, starting: 150 },
  },
  machine: {
    samples: 0,
    scope: "shape",
    readyLowSeconds: 240,
    readyTypicalSeconds: 450,
    readyHighSeconds: 900,
    startsAtSeconds: {
      preparing: 13,
      building: 70,
      checking: 330,
      installing: 360,
      starting: 420,
    },
  },
};

export function cloudSetupShape(
  session: Pick<CloudSession, "projectMachine" | "machineSetup"> | null,
): CloudSetupShape {
  if (session?.machineSetup === true) return "setup";
  if (session?.projectMachine === true) return "machine";
  return "plain";
}

/** Whether a client still waits on the repository itself, the slow, honest-about-it kind of setup. */
export function needsRepositorySetup(shape: CloudSetupShape): boolean {
  return shape !== "plain";
}
