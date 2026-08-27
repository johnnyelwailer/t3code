/* oxlint-disable t3code/no-native-title-tooltip -- Story surface: the chip's native title mirrors the production tooltip content for full-name verification in the docs frame. */
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

import { FileTagChipContent } from "~/components/chat/FileTagChip";

/**
 * Arbitrary-file attachment chip (composer + user message timeline).
 *
 * The composer now accepts any file, not just images: non-images attach as
 * `type: "file"`, upload through the same attachment store, and the agent
 * reads them through the provider's `[Attached file … is saved at: …]` path
 * line. The chip is the only visual: no pixel preview, just the sprite icon
 * inferred from the file name plus the file name.
 *
 * - Composer surface: the chip inside the composer while the upload runs and
 *   afterwards (icon + name, no preview thumbnail).
 * - Message timeline surface: the file chip row rendered above a user
 *   message whose attachments include `type: "file"`.
 */

const theme =
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

const samples = [
  { path: "notes.txt", label: "notes.txt" },
  { path: "spec.pdf", label: "spec.pdf" },
  { path: "attachment.ts", label: "attachment.ts" },
  {
    path: "very-long-release-candidate-build-42-2026-08-27-final-final.bin",
    label: "very-long-release-candidate-build-42-2026-08-27-final-final.bin",
  },
] as const;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 text-xs font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function FileChipRow() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {samples.map((sample) => (
        <div
          key={sample.path}
          className="inline-flex max-w-xs items-center gap-1.5 rounded-md border border-border/80 bg-background/70 px-2 py-1 text-xs"
          title={`${sample.label} (${sample.path.length} bytes)`}
        >
          <FileTagChipContent path={sample.path} label={sample.label} theme={theme} />
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: "T3Team/Composer/Attachment File Chip",
  component: FileTagChipContent,
} as Meta;

export default meta;

type Story = StoryObj;

/** Composer surface: file chips sit in the composer row while uploads run. */
export const ComposerChips: Story = {
  render: () => (
    <Card title="Composer (upload pending → sent)">
      <FileChipRow />
    </Card>
  ),
};

/** Message timeline surface: file chips render above the user message text. */
export const MessageTimelineChips: Story = {
  render: () => (
    <Card title="User message timeline">
      <FileChipRow />
      <div className="mt-3 text-sm text-foreground">
        Here are the notes and the spec — check the build log against both.
      </div>
    </Card>
  ),
};

/**
 * Long file names: the chip caps its width and truncates; the full name is
 * carried by the tooltip title.
 */
export const LongNamesTruncate: Story = {
  render: () => (
    <Card title="Long file names (truncated, full name in tooltip)">
      <FileChipRow />
    </Card>
  ),
};
