import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "../../src/ui/shared/ui";
import { VIRTUALIZE_AFTER } from "../../src/ui/shared/ui/DataTable";

interface Row {
  id: string;
  name: string;
}

const columns = [{ key: "name", header: "Name" }];
const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }));

describe("DataTable", () => {
  it("renders every row of a small table", () => {
    render(<DataTable columns={columns} rows={makeRows(20)} getRowKey={(row) => row.id} />);
    expect(screen.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByRole("table")).not.toHaveAttribute("aria-rowcount");
  });

  it("passes the row index to getRowKey", () => {
    const getRowKey = vi.fn((_row: Row, index: number) => String(index));
    render(<DataTable columns={columns} rows={makeRows(3)} getRowKey={getRowKey} />);
    expect(getRowKey.mock.calls.map(([, index]) => index)).toEqual([0, 1, 2]);
  });

  describe("with many rows", () => {
    beforeEach(() => {
      // jsdom has no layout; give the scroll container a 400px viewport.
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(400);
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    });
    afterEach(() => vi.restoreAllMocks());

    it("renders only the rows in view and keeps the full row count for assistive tech", () => {
      const rows = makeRows(5000);
      render(<DataTable columns={columns} rows={rows} getRowKey={(row) => row.id} />);

      const table = screen.getByRole("table");
      expect(table).toHaveAttribute("aria-rowcount", "5001");
      const rendered = within(table)
        .getAllByRole("row")
        .filter((row) => row.getAttribute("aria-hidden") !== "true");
      expect(rendered.length).toBeGreaterThan(1);
      expect(rendered.length).toBeLessThan(60);
      expect(screen.getByText("Row 0")).toBeInTheDocument();
      expect(screen.queryByText("Row 4999")).not.toBeInTheDocument();
      expect(screen.getByText("Row 0").closest("tr")).toHaveAttribute("aria-rowindex", "2");
    });

    it("still reports clicks on virtualized rows", () => {
      const onRowClick = vi.fn();
      render(
        <DataTable
          columns={columns}
          rows={makeRows(VIRTUALIZE_AFTER + 1)}
          getRowKey={(row) => row.id}
          onRowClick={onRowClick}
        />,
      );
      fireEvent.click(screen.getByText("Row 3"));
      expect(onRowClick).toHaveBeenCalledWith({ id: "r3", name: "Row 3" });
    });
  });
});
