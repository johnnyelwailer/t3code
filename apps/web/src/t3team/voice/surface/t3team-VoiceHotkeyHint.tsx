import { Kbd, KbdGroup } from "~/components/ui/kbd";

/** "or press Ctrl Alt Space again": nothing where the app has no global shortcut. */
export function VoiceHotkeyHint(props: {
  readonly keys: readonly string[];
  readonly lead: string;
  readonly suffix?: string;
}) {
  if (props.keys.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {props.lead}
      <KbdGroup>
        {props.keys.map((key, index) => (
          <Kbd key={`${key}:${index}`}>{key}</Kbd>
        ))}
      </KbdGroup>
      {props.suffix}
    </span>
  );
}
