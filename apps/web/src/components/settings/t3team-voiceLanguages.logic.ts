export const VOICE_LANGUAGE_AUTO = "auto";

export type VoiceLanguageOption = { readonly value: string; readonly label: string };

/** The codes of a comma-separated list: trimmed, lowercased, without empties, repeats or `auto`. */
export function parseVoiceLanguages(raw: string): string[] {
  const codes = raw
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter((code) => code !== "" && code !== VOICE_LANGUAGE_AUTO);
  return [...new Set(codes)];
}

/** What gets saved for an edited list; the normal form `parseVoiceLanguages` reads back unchanged. */
export function formatVoiceLanguages(raw: string): string {
  return parseVoiceLanguages(raw).join(",");
}

/** A language written in itself (`de` is Deutsch); a code the runtime does not know stays as typed. */
export function voiceLanguageLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    if (name === undefined || name.toLowerCase() === code.toLowerCase()) return code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

/**
 * Auto, then the configured languages in order. A pinned language missing from the list stays
 * selectable at the end, so the picker never shows a blank for a value that is still in force.
 */
export function voiceLanguageOptions(languages: string, pinned: string): VoiceLanguageOption[] {
  const codes = parseVoiceLanguages(languages);
  const current = pinned.trim().toLowerCase();
  if (current !== VOICE_LANGUAGE_AUTO && !codes.includes(current)) codes.push(current);
  return [
    { value: VOICE_LANGUAGE_AUTO, label: "Auto" },
    ...codes.map((code) => ({ value: code, label: voiceLanguageLabel(code) })),
  ];
}
