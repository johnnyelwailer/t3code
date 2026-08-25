import { useState, type ReactNode } from "react";
import { STOP_MODES, type StopMode, type VoiceState } from "./types.ts";

/**
 * The record/stop control as ONE connected element (approved lab variant
 * V5): at rest a neutral round mic button; while recording a red-tinted
 * pill — circle (stop) + hairline divider + attached chevron tab opening
 * the stop-mode menu. No detached elements.
 */
export function RecordingPill({
  state,
  disabled = false,
  onToggle,
  stopMode,
  onPickStopMode,
  children,
}: {
  state: VoiceState;
  disabled?: boolean;
  onToggle: () => void;
  stopMode: StopMode;
  onPickStopMode: (mode: StopMode) => void;
  /** Recording content (typically the live bars). */
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (state !== "recording") {
    const denied = state === "denied";
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        aria-label={denied ? "Mikrofon nicht verfügbar" : "Spracherkennung starten"}
        title={denied ? "Mikrofon-Zugriff verweigert — Erlaubnis im Browser erteilen" : undefined}
        className={
          "flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-foreground transition-all hover:bg-accent" +
          (denied ? " opacity-50" : disabled ? " opacity-40" : "")
        }
      >
        <MicIcon />
      </button>
    );
  }
  return (
    <div
      className={
        "relative flex h-9 items-stretch rounded-full border border-red-500/40 bg-red-500/10 text-red-500" +
        (disabled ? " opacity-40" : "")
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label="Aufnahme beenden"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-l-full"
      >
        {children}
      </button>
      <div className="my-1.5 w-px shrink-0 bg-red-500/25" />
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Stop-Modus"
        aria-expanded={menuOpen}
        className="flex h-9 w-7 shrink-0 items-center justify-center rounded-r-full transition-colors hover:bg-red-500/15"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute bottom-full right-0 z-50 mb-2 min-w-44 rounded-lg border border-border/60 bg-popover p-1 text-foreground shadow-lg">
          {STOP_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              className={
                "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors" +
                (stopMode === mode
                  ? " bg-accent text-foreground"
                  : " text-muted-foreground hover:bg-accent/50 hover:text-foreground")
              }
              aria-pressed={stopMode === mode}
              onClick={() => {
                onPickStopMode(mode);
                setMenuOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}
