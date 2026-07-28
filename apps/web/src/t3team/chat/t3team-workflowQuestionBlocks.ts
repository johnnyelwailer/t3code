/**
 * The structure inside an `askUser` question string.
 *
 * A question is authored as prose with real line breaks and reaches the card as ONE string. The card
 * rendered it in a `<p>`, and HTML collapses every newline to a space — so a confirmation like
 *
 *   Rewrite the description of NXAI-8 with these changes?\n\n
 *   Add acceptance criteria and state who the Dev-Rolle is for.\n\n
 *   Confirm, or reply with what to do instead.
 *
 * arrived as one run-on sentence with the user's own note swallowed mid-sentence and the trailing
 * instruction fused onto it. That is a RENDERER defect, not an authoring one: every askUser in the
 * product has it, and making bodies hand-pack punctuation to survive a lossy renderer would push the
 * workaround into every workflow anyone ever writes.
 *
 * The convention this parses is the one confirmation asks already follow — framing, then the material
 * being confirmed, then the instruction:
 *
 *   - blank lines separate BLOCKS
 *   - single newlines inside a block are ITEMS (a block with several lines is a list)
 *   - with three or more blocks, the interior ones are the quoted material — the user's own words,
 *     which must read as theirs and not as the workflow's voice
 *
 * With fewer than three blocks nothing is quoted, because there is no sandwiched material to set off.
 * That degrades to "render the author's line breaks faithfully", which is the floor this must hit.
 */

export type T3TeamQuestionBlock = {
  readonly kind: "prose" | "quoted";
  readonly lines: ReadonlyArray<string>;
};

export function parseT3TeamQuestionBlocks(
  question: string,
): ReadonlyArray<T3TeamQuestionBlock> {
  const blocks = question
    .split(/\n[ \t]*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    )
    .filter((lines) => lines.length > 0);

  if (blocks.length === 0) {
    return [];
  }

  const lastIndex = blocks.length - 1;
  return blocks.map((lines, index) => ({
    kind: blocks.length >= 3 && index > 0 && index < lastIndex ? "quoted" : "prose",
    lines,
  }));
}
