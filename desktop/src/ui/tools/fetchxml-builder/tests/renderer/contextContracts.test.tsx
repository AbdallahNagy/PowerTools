import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DragProvider } from "../../components/filter-builder/DragProvider";
import { useDrag } from "../../components/filter-builder/useDrag";
import { FetchXmlBuilderProvider } from "../../context/FetchXmlBuilderProvider";
import { useFetchXmlBuilder } from "../../context/useFetchXmlBuilder";

const root = { id: "root", kind: "group" as const, logic: "and" as const, children: [] };

function FetchXmlBuilderState() {
  const { connectionName, tables } = useFetchXmlBuilder();
  return <output aria-label="fetchxml builder state">{connectionName}:{tables.length}</output>;
}

function DragState() {
  const { beginDrag, dragId, endDrag } = useDrag();
  return (
    <>
      <button type="button" onClick={() => beginDrag("root")}>Begin drag</button>
      <button type="button" onClick={endDrag}>End drag</button>
      <output aria-label="drag id">{dragId ?? "none"}</output>
    </>
  );
}

describe("FetchXML Builder context contracts", () => {
  it("rejects consumers outside their providers", () => {
    expect(() => render(<FetchXmlBuilderState />)).toThrow(
      "useFetchXmlBuilder must be used within FetchXmlBuilderProvider",
    );
    expect(() => render(<DragState />)).toThrow("useDrag must be used inside DragProvider");
  });

  it("keeps provider state and drag commands available", () => {
    render(
      <>
        <FetchXmlBuilderProvider connectionName="Main" tables={[]}>
          <FetchXmlBuilderState />
        </FetchXmlBuilderProvider>
        <DragProvider root={root}><DragState /></DragProvider>
      </>,
    );

    expect(screen.getByRole("status", { name: "fetchxml builder state" })).toHaveTextContent("Main:0");
    fireEvent.click(screen.getByRole("button", { name: "Begin drag" }));
    expect(screen.getByRole("status", { name: "drag id" })).toHaveTextContent("root");
    fireEvent.click(screen.getByRole("button", { name: "End drag" }));
    expect(screen.getByRole("status", { name: "drag id" })).toHaveTextContent("none");
  });
});
