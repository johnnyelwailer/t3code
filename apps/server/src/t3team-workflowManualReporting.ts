/**
 * How an orchestration should report back to the human.
 *
 * Its own module, and its own `t3team_help("reporting")` entry, for the same reason the timers
 * manual is: the orchestration manual is loaded into context every turn and is two lines under the
 * additive guard's hard 200-line ceiling, so on-demand topics live beside it rather than inside it.
 *
 * Written because of a real run on 2026-08-29. A delivery orchestration finished, failed its QA
 * gate, and reported via `notifyUser` in a single 4460-character block of unbroken prose —
 * measurements inline in sentences, the verdict buried mid-paragraph. The user's response was "a
 * super verbose ugly formatted report that i honestly dont want to read". The content was good;
 * every claim carried evidence. Only the shape was wrong, and nothing in the manual had ever told
 * the authoring agent what shape to use.
 *
 * The same run also produced a structured return that the engine rendered as two readable lines
 * ("Delivered: false / Reason: QA failed"), which is why RETURN-DON'T-NARRATE leads the contract:
 * the good path already existed and went unused.
 *
 * @module t3team-workflowManualReporting
 */

/**
 * The reporting contract, surfaced as `t3team_help("reporting")` and pointed at from the RULES
 * section of the main manual.
 */
export const T3TEAM_REPORTING_MANUAL = `REPORTING — what the human actually reads.

Your orchestration's report is read by a person who did not watch it run. Every step thread stays
inspectable in the UI, so the report is a SUMMARY, not a transcript. Detail belongs in the steps;
the report says what happened and what it means.

1. SHOW IT — DON'T DESCRIBE IT
If the report has any structure at all, RENDER it. A visual is the default medium here, not a
garnish, and text is what you fall back to when there is genuinely nothing to show.

  await getThread().showWidget({ title: 'QA verdict', widgetCode: html, format: 'html' })

Requires capabilities: ['user']. The authoring contract — host theme variables, the icon sprite, no
hard-coded colours, works in light and dark — is t3team_help("widget-guidance"). Follow it; a
widget that ignores the theme looks broken in half the app.

Reach for a widget whenever the report contains:
- numbers to compare (benchmarks, timings, counts, before/after) — a chart or table, never a
  sentence per figure;
- a pass/fail matrix across cases or checks;
- ranked or grouped findings, especially with severity;
- anything the reader will want to scan rather than read.

A benchmark described in prose is the single worst case: the reader has to reconstruct a table in
their head from sentences. Build the table.

2. RETURN, DON'T NARRATE
Prefer returning a structured result over writing prose. The host renders a returned object as
clean labelled lines; prose is rendered as-is, exactly as you typed it.

  return { delivered: false, reason: 'QA failed', blockers: ['output parity', 'benchmark'] }

renders as three readable lines. The same information as a paragraph renders as a paragraph.
Use showWidget/notifyUser for what the user must SEE, and the return value for the OUTCOME —
they are complements, not alternatives: show the evidence, return the verdict.

3. LEAD WITH THE VERDICT
The first line may be the only line read — a long report is collapsed to it. Put the outcome there,
in plain words, with the consequence:

  GOOD  QA failed — nothing was pushed to main. 2 blockers.
  BAD   Summary: the implementation is solid and nearly everything verifies, however...

Never open with methodology, scope, or a restatement of the task.

4. IF IT IS TEXT, STRUCTURE IT
Text is the fallback, not the default (see 1). When you do write it, it renders as markdown — use
that.
- Short headed sections, not one paragraph per topic.
- A bullet per finding. One finding per bullet.
- NUMBERS GO IN A TABLE. Benchmark figures, counts, pass/fail tallies and before/after pairs are
  unreadable inline; a row per case beats a sentence per case, every time. If you are writing a
  markdown table by hand, that is the signal you should have rendered a widget instead.
- Code, paths and commands in backticks, so they can be picked out and copied.

5. LENGTH
If it does not change what the reader thinks or does, cut it. Specifically cut: what you attempted,
how thorough you were, methodology narration, and restating the same finding in a summary AND a
detail section. Keep every concrete measurement and every file reference — those are the value.

A report longer than a screen needs a table or fewer words, not more paragraphs.

6. NEVER DUMP A SUB-AGENT'S OUTPUT VERBATIM
notifyUser(agentResult) forwards someone else's unedited text, including its throat-clearing. You
asked for that work; you compose the summary. Compose across agents too — N results merged into one
ranked list, not N blocks concatenated.

7. UNCERTAINTY AND FAILURE ARE FIRST-CLASS
Say plainly what you could not verify, and why. A failure report leads with what failed and what it
blocks, not with what succeeded first. Do not soften a blocker into a caveat halfway down.`;
