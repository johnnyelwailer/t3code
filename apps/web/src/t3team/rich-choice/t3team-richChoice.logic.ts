/**
 * The headless rich-choice logic lives in `@t3tools/shared/t3team-richChoiceLogic` so the web and
 * mobile views share one definition. This module re-exports it and adds the one web-only field of
 * an option: a React node used as a stand-in visual.
 */
import type { ReactNode } from "react";
import type { RichChoiceOption as RichChoiceOptionBase } from "@t3tools/shared/t3team-richChoiceLogic";

export * from "@t3tools/shared/t3team-richChoiceLogic";

export interface RichChoiceOption extends RichChoiceOptionBase {
  /** Stand-in visual (an icon) when there is no illustration. */
  readonly visual?: ReactNode | undefined;
}
