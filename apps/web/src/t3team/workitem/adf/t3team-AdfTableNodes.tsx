import type { CSSProperties, ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { T3TeamAdfBlockStack } from "./t3team-adfNodeRegistry";
import {
  adfAttrBoolean,
  adfAttrNumber,
  adfChildren,
  type AdfNode,
  type AdfNodeProps,
  type AdfNodeRenderers,
} from "./t3team-adfRendererTypes";

const CELL_CLASS = "border-r border-b border-border/60 px-3 py-2 align-top text-xs";
const HEADER_CELL_CLASS = "bg-muted/50 text-left font-semibold text-foreground";
const NUMBER_CELL_CLASS = "w-10 text-center text-muted-foreground tabular-nums";

type AdfRowProps = AdfNodeProps & { readonly rowNumber?: number | undefined };

function isHeaderRow(row: AdfNode): boolean {
  const cells = adfChildren(row);
  return cells.length > 0 && cells.every((cell) => cell.type === "tableHeader");
}

function cellWidthStyle(node: AdfNode): CSSProperties | undefined {
  const widths = node.attrs?.["colwidth"];
  const first = Array.isArray(widths) ? widths[0] : undefined;
  if (typeof first !== "number" || !Number.isFinite(first) || first <= 0) return undefined;
  return { width: `${Math.round(first)}px` };
}

function T3TeamAdfTableCell({ node, ctx, depth }: AdfNodeProps): ReactNode {
  const isHeader = node.type === "tableHeader";
  const Tag = isHeader ? "th" : "td";
  // Author cell backgrounds are literal hex; a theme pack owns the palette, so the
  // "highlighted" intent is kept as a neutral token-backed tint instead of the raw colour.
  const highlighted = typeof node.attrs?.["background"] === "string";
  return (
    <Tag
      className={cn(
        CELL_CLASS,
        isHeader ? HEADER_CELL_CLASS : "text-foreground",
        highlighted && !isHeader ? "bg-muted/30" : undefined,
      )}
      colSpan={adfAttrNumber(node, "colspan")}
      rowSpan={adfAttrNumber(node, "rowspan")}
      style={cellWidthStyle(node)}
    >
      <T3TeamAdfBlockStack nodes={adfChildren(node)} ctx={ctx} depth={depth} />
    </Tag>
  );
}

function T3TeamAdfTableRow({ node, ctx, depth, rowNumber }: AdfRowProps): ReactNode {
  const cells = adfChildren(node);
  const header = isHeaderRow(node);
  return (
    <tr>
      {rowNumber === undefined ? null : header ? (
        <th className={cn(CELL_CLASS, "bg-muted/50 font-semibold", NUMBER_CELL_CLASS)} />
      ) : (
        <td className={cn(CELL_CLASS, NUMBER_CELL_CLASS)}>{rowNumber}</td>
      )}
      {cells.map((cell, index) => (
        <T3TeamAdfTableCell key={index} node={cell} ctx={ctx} depth={depth} />
      ))}
    </tr>
  );
}

/**
 * The table owns its own horizontal scroll container, so a wide Jira table never makes the
 * page body scroll sideways.
 */
function T3TeamAdfTable({ node, ctx, depth }: AdfNodeProps): ReactNode {
  const rows = adfChildren(node).filter((row) => row.type === "tableRow");
  if (rows.length === 0) return null;
  const numbered = adfAttrBoolean(node, "isNumberColumnEnabled");
  let counter = 0;
  return (
    <div
      className="w-full max-w-full overflow-x-auto rounded-lg border border-border/70"
      data-adf-table-scroll="true"
    >
      <table className="w-full min-w-max border-collapse text-xs [&_tr:last-child>*]:border-b-0 [&_tr>*:last-child]:border-r-0">
        <tbody>
          {rows.map((row, index) => {
            // Header rows keep an empty number cell; body rows are numbered from 1.
            const rowNumber = isHeaderRow(row) ? 0 : (counter += 1);
            return (
              <T3TeamAdfTableRow
                key={index}
                node={row}
                ctx={ctx}
                depth={depth + 1}
                rowNumber={numbered ? rowNumber : undefined}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const adfTableNodeRenderers: AdfNodeRenderers = {
  table: T3TeamAdfTable,
  tableRow: T3TeamAdfTableRow,
  tableCell: T3TeamAdfTableCell,
  tableHeader: T3TeamAdfTableCell,
};
