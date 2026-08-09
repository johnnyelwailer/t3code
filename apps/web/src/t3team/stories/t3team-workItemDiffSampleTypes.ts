import type { T3TeamDiffSegment } from "~/t3team/workitem/t3team-WorkItemDiffPrimitives";

/**
 * A realistic ticket description for the diff review story.
 *
 * Deliberately mundane and specific — a supplier-catalogue importer with real numbers, filenames and
 * constraints. Lorem-ipsum content makes a diff look convincing when it is not: you cannot tell
 * whether a highlight lands sensibly if the words underneath carry no meaning.
 */

type State = "add" | "del" | "edit";

export type DiffSampleBlock =
  | { readonly id: string; readonly type: "heading"; readonly state?: State; readonly text: string }
  | {
      readonly id: string;
      readonly type: "paragraph" | "bullet" | "panel";
      readonly state?: State;
      readonly segments: ReadonlyArray<T3TeamDiffSegment>;
    }
  | {
      readonly id: string;
      readonly type: "lozenges";
      readonly state?: State;
      readonly label: string;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly id: string;
      readonly type: "media";
      readonly state?: State;
      readonly items: ReadonlyArray<{
        readonly label: string;
        readonly kind: "image" | "video";
        readonly state?: State;
      }>;
    }
  | {
      readonly id: string;
      readonly type: "code";
      readonly state?: State;
      readonly lines: ReadonlyArray<{ readonly text: string; readonly state?: State }>;
    }
  | {
      readonly id: string;
      readonly type: "table";
      readonly state?: State;
      readonly columns: ReadonlyArray<string>;
      readonly rows: ReadonlyArray<{
        readonly state?: State;
        readonly cells: ReadonlyArray<ReadonlyArray<T3TeamDiffSegment>>;
      }>;
    }
  | { readonly id: string; readonly type: "embed"; readonly state?: State; readonly label: string };

export const plain = (text: string): ReadonlyArray<T3TeamDiffSegment> => [{ text }];

/** The two blocks above the collapsed region. */
