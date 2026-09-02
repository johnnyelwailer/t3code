import "./t3team-sdk.globals.ts";

/**
 * Generic model constructor only. Provider instances and model slugs are runtime facts; obtain
 * them from the host's live model catalog (`t3team_models`) instead of an SDK-maintained tree.
 */
export { defineModel } from "./t3team-sdk.ts";
export type { ModelRef, ModelSelection } from "./t3team-sdk.types.ts";
