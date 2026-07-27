import type { AdfNode } from "./types.ts";

export interface CellSpec {
  content: AdfNode[];
  background?: string;
  colspan?: number;
  rowspan?: number;
  colwidth?: number[];
}

type CellInput = string | CellSpec;

function toCellSpec(cell: CellInput): CellSpec {
  return typeof cell === "string"
    ? { content: [{ type: "paragraph", content: cell ? [{ type: "text", text: cell }] : [] }] }
    : cell;
}

function cellAttrs(spec: CellSpec): Record<string, unknown> | undefined {
  const attrs: Record<string, unknown> = {};
  if (spec.background !== undefined) attrs.background = spec.background;
  if (spec.colspan !== undefined) attrs.colspan = spec.colspan;
  if (spec.rowspan !== undefined) attrs.rowspan = spec.rowspan;
  if (spec.colwidth !== undefined) attrs.colwidth = spec.colwidth;
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function tableRow(cells: CellInput[], isHeader: boolean): AdfNode {
  return {
    type: "tableRow",
    content: cells.map((cell) => {
      const spec = toCellSpec(cell);
      const attrs = cellAttrs(spec);
      const node: AdfNode = { type: isHeader ? "tableHeader" : "tableCell", content: spec.content };
      if (attrs) node.attrs = attrs;
      return node;
    }),
  };
}

/**
 * A table built from a header row plus data rows. Cells may be plain strings
 * or `CellSpec` objects for rich content/attrs (background, colspan, rowspan,
 * colwidth). Returns `undefined` for an empty row set — ADF requires
 * `table.content` to have at least one `tableRow` (B3).
 */
export function table(rows: CellInput[][]): AdfNode | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  const [headerRow, ...bodyRows] = rows;
  return {
    type: "table",
    content: [tableRow(headerRow ?? [], true), ...bodyRows.map((row) => tableRow(row, false))],
  };
}
