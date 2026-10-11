/**
 * Bundle entry: `effect`, as the host's own instance. Recipe modules loaded from disk import
 * `effect`; in the published bundle it is inlined and not installed, so the resolver fallback
 * (t3team-projectRecipeModuleResolution.ts) points them here. Sharing the bundle's chunk is what keeps
 * ONE instance of effect, which Context and service identity require.
 */
export * from "effect";
