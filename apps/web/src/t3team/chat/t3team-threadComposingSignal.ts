/**
 * Per-thread composing heartbeat → inter-agent drain back-off.
 *
 * While the user types in a thread's composer, this module reports a
 * debounced heartbeat to the server (`orchestration.noteComposing`, the
 * existing WebSocket) carrying the THREAD IT IS TYPED IN. The server holds
 * that thread's inter-agent digest until the heartbeat lapses — per thread,
 * self-clearing, no hard cap. Typing in thread A therefore never holds back
 * the digest in thread B.
 *
 * Client-side pacing: a beat is sent on the first keystroke after a gap and
 * at most every {@link TYPING_HEARTBEAT_THROTTLE_MS} while typing continues
 * (a throttle, not a debounce — a debounce would fire only AFTER typing
 * stops), plus ONE trailing beat after the input settles. The server lapse
 * (T3TEAM_THREAD_TYPING_LAPSE_MS, 15s) is far longer than the 4s throttle,
 * so a typing session never lapses mid-session; a few seconds of keystroke
 * gap does not end engagement, and putting the laptop down lapses it within
 * ~17s.
 *
 * Fire-and-forget by contract: a lost beat or a missing environment must
 * NEVER block typing or message sending.
 */

import {
  EnvironmentId,
  ORCHESTRATION_WS_METHODS,
  ThreadId,
} from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  runAtomCommand,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "~/connection/runtime";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "~/state/primaryEnvironment";

const noteThreadComposingCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "t3team:orchestration:noteComposing",
  tag: ORCHESTRATION_WS_METHODS.noteComposing,
});

/** While typing continues, re-send the beat at most this often. */
const TYPING_HEARTBEAT_THROTTLE_MS = 4_000;
/** After input settles, one final beat this long after the last keystroke. */
const TYPING_HEARTBEAT_TRAILING_MS = 1_500;

interface ThreadComposingBeat {
  lastSentAt: number;
  trailingTimer: number | null;
}

/**
 * Pacing state keyed by ENVIRONMENT + THREAD (NUL-separated: neither id can
 * contain \u0000). The environment prefix keeps typing in the same thread id
 * on two different environment servers from throttling each other — each
 * server gets its own heartbeat stream.
 */
const beatsByEnvironmentThread = new Map<string, ThreadComposingBeat>();

const environmentThreadKey = (environmentId: EnvironmentId, threadId: string): string =>
  `${environmentId}\u0000${threadId}`;

function sendComposingBeat(threadId: string, environmentId: EnvironmentId): void {
  // Fire-and-forget: the command schedules its own async work; a failure is
  // swallowed (the next keystroke re-sends) and must never surface to the
  // composer or block typing / message sending.
  void runAtomCommand(
    appAtomRegistry,
    noteThreadComposingCommand,
    { environmentId, input: { threadId: ThreadId.make(threadId) } },
    { label: "t3team-thread-composing", reportFailure: false },
  ).catch(() => {
    // Intentionally empty: see the note above.
  });
}

/**
 * Report that the user just typed in `threadId`'s composer (call on every
 * prompt mutation of a real thread; draft-only composers have no server
 * thread and pass null from the caller).
 */
export function reportThreadComposing(threadId: string | null | undefined): void {
  if (threadId === undefined || threadId === null || threadId.length === 0) {
    return;
  }
  // The composer only exists in the browser; keep this safe to call from
  // node-context code paths (tests, previews, server-side render helpers).
  if (typeof window === "undefined") {
    return;
  }
  // The heartbeat targets the SAME environment as every other t3team thread
  // command (runT3TeamOrchestrationDispatch resolves it identically): if no
  // environment is paired there is no server to hold — do not even track
  // pacing state for it.
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  if (environmentId === null) {
    return;
  }
  const key = environmentThreadKey(environmentId, threadId);
  let existing = beatsByEnvironmentThread.get(key);
  if (existing === undefined) {
    existing = { lastSentAt: 0, trailingTimer: null };
    beatsByEnvironmentThread.set(key, existing);
  }
  const beat = existing;
  const now = Date.now();
  if (now - beat.lastSentAt >= TYPING_HEARTBEAT_THROTTLE_MS) {
    beat.lastSentAt = now;
    sendComposingBeat(threadId, environmentId);
  }
  if (beat.trailingTimer !== null) {
    window.clearTimeout(beat.trailingTimer);
  }
  beat.trailingTimer = window.setTimeout(() => {
    beat.trailingTimer = null;
    // A beat already went out after the input settled (e.g. the throttle
    // fired on the final keystroke): the trailing beat would be a duplicate.
    if (Date.now() - beat.lastSentAt < TYPING_HEARTBEAT_THROTTLE_MS / 2) {
      return;
    }
    beat.lastSentAt = Date.now();
    sendComposingBeat(threadId, environmentId);
  }, TYPING_HEARTBEAT_TRAILING_MS);
}
