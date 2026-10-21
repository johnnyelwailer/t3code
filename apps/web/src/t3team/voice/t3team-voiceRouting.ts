/**
 * Two-tier model routing for the voice thread (spec §5.1). The server classifies each utterance
 * with one Instant call; the utterance is then sent with that tier's per-message `modelSelection`
 * (the nexplore gateway exposes its reasoning tiers as model slugs).
 */
import type { ModelSelection } from "@t3tools/contracts";
import { ProviderInstanceId } from "@t3tools/contracts";

import { resolveWsBaseUrl } from "~/t3team/t3team-route-surface-wsUrl";
import { postJson, resolveHttpBaseUrl } from "~/t3team/backend/t3team-t3BackendHttp";

export type VoiceTier = "control" | "synthesis";

const NEXPLORE = ProviderInstanceId.make("nexplore");

export const VOICE_TIER_MODEL: Readonly<Record<VoiceTier, ModelSelection>> = {
  control: { instanceId: NEXPLORE, model: "no-thinking" },
  synthesis: { instanceId: NEXPLORE, model: "low" },
};

type RouteResponse = { readonly tier: VoiceTier };
export type PostVoiceRoute = (text: string) => Promise<RouteResponse>;

const postVoiceRoute: PostVoiceRoute = (text) =>
  postJson<{ text: string }, RouteResponse>(
    resolveHttpBaseUrl(resolveWsBaseUrl()),
    "/api/t3team/voice/route",
    { text },
    { timeoutMs: 6_000 },
  );

/** An unreachable router must not drop the utterance: synthesis is right for any of them. */
export async function routeVoiceUtterance(
  text: string,
  post: PostVoiceRoute = postVoiceRoute,
): Promise<ModelSelection> {
  const tier = await post(text).then(
    (response) => response.tier,
    () => "synthesis" as const,
  );
  return VOICE_TIER_MODEL[tier === "control" ? "control" : "synthesis"];
}
