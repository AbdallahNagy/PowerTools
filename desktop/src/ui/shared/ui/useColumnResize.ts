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
  /**
   * Puts one column back to the width the table gave it before the first
   * resize. Once no column differs from that, the table sizes columns itself again.
   */
  resetColumn: (key: string) => void;
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
  // Column widths the table chose itself, taken just before the first resize.
  const autoWidths = useRef<Record<string, number>>({});

  const widthOf = useCallback(
    (key: string) => (widths == null ? undefined : (widths[key] ?? DEFAULT_COLUMN_WIDTH)),
    [widths],
  );

  const measure = useCallback(() => {
    const measured: Record<string, number> = { ...widths };
    const cells = tableRef.current?.querySelectorAll<HTMLElement>("thead th[data-column-key]") ?? [];
    for (const cell of cells) {
      const key = cell.dataset.columnKey!;
      // Keep widths the user already set; only fill in columns without one.
      measured[key] ??= cell.getBoundingClientRect().width;
    }
    if (widths == null) autoWidths.current = { ...measured };
    setWidths(measured);
    return measured;
  }, [widths]);

  const setWidth = useCallback((key: string, width: number) => {
    setWidths((current) => ({ ...current, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) }));
  }, []);

  const resetColumn = useCallback((key: string) => {
    setWidths((current) => {
      if (current == null) return null;
      const next = { ...current, [key]: autoWidths.current[key] ?? DEFAULT_COLUMN_WIDTH };
      const changed = Object.keys(next).some(
        (k) => Math.abs(next[k]! - (autoWidths.current[k] ?? DEFAULT_COLUMN_WIDTH)) >= 1,
      );
      return changed ? next : null;
    });
  }, []);

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
    resetColumn,
  };
}
