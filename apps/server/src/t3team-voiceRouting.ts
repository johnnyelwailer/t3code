/**
 * Voice agent two-tier routing (spec §5.1): one lightweight Instant (`no-thinking`) call decides
 * per utterance whether it is a pure control command or needs synthesis, BEFORE the utterance is
 * sent to the voice thread with the matching per-message model.
 */
import { postNexploreChat, type NexploreChatRequest } from "./t3team-nexploreGateway.ts";

export type VoiceTier = "control" | "synthesis";

/** Bench round 2: Instant p95 ~990 ms; a slower answer is worse than the synthesis default. */
const VOICE_ROUTE_TIMEOUT_MS = 4_000;
const VOICE_ROUTE_MODEL = "no-thinking";

/**
 * Byte-identical on every call so the gateway's KV prefix stays cached; the utterance is the
 * only variable part and goes last.
 */
export const VOICE_ROUTE_SYSTEM_PROMPT = [
  "You route one transcribed voice utterance for a hands-free agent that controls a coding",
  "workspace. Answer with exactly one word.",
  "",
  "control: a single short, unambiguous command to act on a thread or pull request, such as",
  "spawn, start, stop, interrupt, restart, nudge, queue, watch or archive something.",
  "synthesis: everything else: questions, status requests, summaries, comparisons, anything",
  "that needs reading and reasoning before acting, a command mixed with a question, or any",
  "utterance that is fragmentary or ambiguous.",
  "",
  "When in doubt answer synthesis.",
  "",
  "Examples:",
  "spawn a thread for the login bug -> control",
  "nudge the migration thread -> control",
  "watch pull request 412 -> control",
  "what is blocked right now -> synthesis",
  "summarize what the auth thread did and start a review -> synthesis",
  "the migration seems slow -> synthesis",
].join("\n");

export type VoiceRouteChat = (request: NexploreChatRequest) => Promise<string>;

export const parseVoiceTier = (answer: string): VoiceTier =>
  /^\W*control\b/i.test(answer) ? "control" : "synthesis";

/** Any gateway failure resolves to synthesis, the tier that is right for every utterance. */
export async function classifyVoiceUtterance(
  utterance: string,
  chat: VoiceRouteChat = postNexploreChat,
): Promise<VoiceTier> {
  try {
    const answer = await chat({
      model: VOICE_ROUTE_MODEL,
      timeoutMs: VOICE_ROUTE_TIMEOUT_MS,
      messages: [
        { role: "system", content: VOICE_ROUTE_SYSTEM_PROMPT },
        { role: "user", content: `Utterance: ${utterance}` },
      ],
    });
    return parseVoiceTier(answer);
  } catch {
    return "synthesis";
  }
}
