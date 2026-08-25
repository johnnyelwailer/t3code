import type { VoiceLanguageOption } from "./types.ts";

export interface LanguageChipsProps {
  languages: readonly VoiceLanguageOption[];
  currentLang: string;
  onPick: (code: string) => void;
}

/** The DE/FR/EN-style language chips, shown only while recording. */
export function LanguageChips({ languages, currentLang, onPick }: LanguageChipsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {languages.map((opt) => (
        <button
          key={opt.code}
          type="button"
          className={
            "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors " +
            (currentLang === opt.code
              ? "bg-accent text-foreground"
              : "text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground")
          }
          onClick={(e) => {
            e.stopPropagation();
            onPick(opt.code);
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
