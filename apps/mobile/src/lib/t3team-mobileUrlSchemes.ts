const URL_SCHEME = /^[a-z][a-z0-9+.-]{0,63}$/u;

/**
 * A distribution's custom URL scheme(s) that open the app (e.g. `nexi`). The pack's distribution
 * manifest declares them; app.config.ts surfaces them into the app's `extra` build config, and
 * App.tsx turns them into React Navigation link prefixes. Only valid lowercase scheme strings are
 * kept, so a malformed build config cannot register a scheme the OS would route to us.
 */
export function urlSchemesFromConfig(extra: unknown): readonly string[] {
  const raw =
    typeof extra === "object" && extra !== null
      ? (extra as { urlSchemes?: unknown }).urlSchemes
      : undefined;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const schemes: string[] = [];
  for (const part of raw) {
    const scheme = typeof part === "string" ? part.trim().toLowerCase() : "";
    if (!URL_SCHEME.test(scheme) || seen.has(scheme)) continue;
    seen.add(scheme);
    schemes.push(scheme);
  }
  return schemes;
}
