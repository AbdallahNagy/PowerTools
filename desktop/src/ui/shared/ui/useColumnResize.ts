import { useCallback, useRef, useState, type CSSProperties } from "react";

/** Narrowest a column can be dragged to, in pixels. */
export const MIN_COLUMN_WIDTH = 40;
/** Width given to a column that appears after the user has resized the table. */
export const DEFAULT_COLUMN_WIDTH = 160;

export interface ColumnResize {
  /** Attach to the `<table>`. */
  tableRef: React.RefObject<HTMLTableElement | null>;
  /** True once the user has resized a column. The table then uses a fixed layout. */
  resized: boolean;
  /** Merge into the `<table>` style. Empty until the user resizes a column. */
  tableStyle: CSSProperties | undefined;
  /** Spread onto each header cell. Every header cell of the table needs one. */
  headerProps: (key: string) => { "data-column-key": string; style: CSSProperties | undefined };
  /** Width of a column in pixels, or undefined while the table sizes columns itself. */
  widthOf: (key: string) => number | undefined;
  setWidth: (key: string, width: number) => void;
  /** Starts a resize from the current rendered widths and returns them. */
  measure: () => Record<string, number>;
  /** Goes back to automatic column widths. */
  reset: () => void;
}

/**
 * Lets the user drag header cell edges to make columns wider or narrower.
 * Columns keep their automatic widths until the first resize. Then every
 * column is pinned to its rendered width and the table switches to a fixed
 * layout, so moving one edge does not shift the other columns.
 */
export function useColumnResize(keys: string[]): ColumnResize {
  const tableRef = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState<Record<string, number> | null>(null);

  const widthOf = useCallback(
    (key: string) => (widths == null ? undefined : (widths[key] ?? DEFAULT_COLUMN_WIDTH)),
    [widths],
  );

  const measure = useCallback(() => {
    const measured: Record<string, number> = { ...widths };
    const cells = tableRef.current?.querySelectorAll<HTMLElement>("thead th[data-column-key]") ?? [];
    for (const cell of cells) {
      const key = cell.dataset.columnKey!;
      measured[key] = cell.getBoundingClientRect().width;
    }
    setWidths(measured);
    return measured;
  }, [widths]);

  const setWidth = useCallback((key: string, width: number) => {
    setWidths((current) => ({ ...current, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) }));
  }, []);

  const reset = useCallback(() => setWidths(null), []);

  const tableStyle: CSSProperties | undefined =
    widths == null
      ? undefined
      : {
          tableLayout: "fixed",
          width: keys.reduce((sum, key) => sum + (widths[key] ?? DEFAULT_COLUMN_WIDTH), 0),
        };

  const headerProps = (key: string) => {
    const width = widthOf(key);
    return { "data-column-key": key, style: width == null ? undefined : { width } };
  };

  return {
    tableRef,
    resized: widths != null,
    tableStyle,
    headerProps,
    widthOf,
    setWidth,
    measure,
    reset,
  };
}
