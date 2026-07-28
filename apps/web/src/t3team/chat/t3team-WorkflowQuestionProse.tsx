/**
 * Renders an `askUser` question with its authored structure intact.
 *
 * See `t3team-workflowQuestionBlocks` for why the string carries structure at all. The quoted blocks
 * get the app's existing quoted-feedback vocabulary — a primary left rule, italic, muted — the same
 * one `T3TeamDiffCommentThread` uses for a note left on a passage, so the user's own words read as
 * theirs wherever they appear.
 */

import { parseT3TeamQuestionBlocks } from "~/t3team/chat/t3team-workflowQuestionBlocks";

export function T3TeamWorkflowQuestionProse({ question }: { readonly question: string }) {
  const blocks = parseT3TeamQuestionBlocks(question);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, blockIndex) =>
        block.kind === "quoted" ? (
          <ul
            // Blocks have no identity of their own; position is the only stable key.
            key={`quoted:${String(blockIndex)}`}
            className="space-y-1 border-l-2 border-primary/50 pl-3"
          >
            {block.lines.map((line, lineIndex) => (
              <li
                key={`quoted:${String(blockIndex)}:${String(lineIndex)}`}
                className="text-sm italic leading-6 text-muted-foreground"
              >
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p
            key={`prose:${String(blockIndex)}`}
            className="whitespace-pre-line text-sm leading-6 text-foreground"
          >
            {block.lines.join("\n")}
          </p>
        ),
      )}
    </div>
  );
}
