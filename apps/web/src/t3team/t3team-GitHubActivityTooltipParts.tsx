import type { ComponentType } from "react";

export function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4.25rem_1fr] gap-2">
      <span className="text-muted-foreground/80">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function StatChip({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "negative";
  Icon?: ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-400"
        : "text-foreground/80";
  return (
    <div className={`inline-flex items-center gap-1.5 ${toneClass}`}>
      {Icon ? <Icon className="size-3" /> : null}
      <span className="text-[10px] font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground/80">{label}</span>
    </div>
  );
}

export function AuthorAvatar({
  login,
  avatarUrl,
}: {
  login: string | undefined;
  avatarUrl: string | undefined;
}) {
  if (!login && !avatarUrl) return null;
  const fallback = (login?.[0] ?? "?").toUpperCase();
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={login ? `@${login}` : "GitHub author"}
      className="size-7 rounded-full border border-border/70 object-cover"
    />
  ) : (
    <div className="inline-flex size-7 items-center justify-center rounded-full border border-border/70 bg-muted/40 text-[10px] font-semibold text-foreground/80">
      {fallback}
    </div>
  );
}
