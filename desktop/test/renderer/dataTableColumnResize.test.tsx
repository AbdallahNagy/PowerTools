import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "../../src/ui/shared/ui";
import { MIN_COLUMN_WIDTH } from "../../src/ui/shared/ui/useColumnResize";

interface Row {
  name: string;
  type: string;
}

const columns = [
  { key: "name", header: "Name", sortable: true },
  { key: "type", header: "Type" },
];
const rows: Row[] = [{ name: "account", type: "Table" }];

function renderTable(onSort = vi.fn()) {
  render(
    <DataTable<Row>
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.name}
      onSort={onSort}
      sortKey={null}
    />,
  );
  // jsdom has no layout, so give each header cell a rendered width.
  for (const cell of document.querySelectorAll<HTMLElement>("th[data-column-key]")) {
    vi.spyOn(cell, "getBoundingClientRect").mockReturnValue({ width: 200 } as DOMRect);
  }
  return onSort;
}

function headerCell(name: string) {
  return screen.getByRole("columnheader", { name });
}

function resizeHandle(key: string) {
  return document.querySelector<HTMLElement>(`[data-column-resize="${key}"]`)!;
}

describe("DataTable column resizing", () => {
  it("keeps automatic widths until a column is resized", () => {
    renderTable();
    expect(screen.getByRole("table").style.tableLayout).toBe("");
    expect(headerCell("Name").style.width).toBe("");
  });

  it("drags a header edge to resize that column only", () => {
    const onSort = renderTable();
    const handle = resizeHandle("name");

    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 160, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 160, pointerId: 1 });
    fireEvent.click(handle);

    expect(headerCell("Name").style.width).toBe("260px");
    expect(headerCell("Type").style.width).toBe("200px");
    const table = screen.getByRole("table");
    expect(table.style.tableLayout).toBe("fixed");
    expect(table.style.width).toBe("460px");
    expect(onSort).not.toHaveBeenCalled();
  });

  it("does not shrink a column below the minimum width", () => {
    renderTable();
    const handle = resizeHandle("type");

    fireEvent.pointerDown(handle, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });

    expect(headerCell("Type").style.width).toBe(`${MIN_COLUMN_WIDTH}px`);
  });

  it("resets to automatic widths on double click", () => {
    renderTable();
    const handle = resizeHandle("type");

    fireEvent.pointerDown(handle, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 350, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 350, pointerId: 1 });
    expect(headerCell("Type").style.width).toBe("250px");

    fireEvent.doubleClick(handle);
    expect(headerCell("Type").style.width).toBe("");
    expect(screen.getByRole("table").style.tableLayout).toBe("");
  });

  it("can be turned off", () => {
    render(
      <DataTable<Row> columns={columns} rows={rows} getRowKey={(row) => row.name} resizable={false} />,
    );
    expect(document.querySelector("[data-column-resize]")).toBeNull();
  });
});
