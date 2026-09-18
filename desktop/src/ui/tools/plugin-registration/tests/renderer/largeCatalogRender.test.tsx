import { fireEvent, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderWithProviders } from "../../../../../../test/support/render";
import { RegistrationTree } from "../../components/RegistrationTree";
import { buildCatalogTree } from "../../model/catalogTree";
import { createLargeCatalog } from "./largeCatalog.test";

const originalResizeObserver = window.ResizeObserver;

describe("rendered large registration catalogs", () => {
  beforeAll(() => {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  afterAll(() => {
    if (originalResizeObserver) window.ResizeObserver = originalResizeObserver;
    else Reflect.deleteProperty(window, "ResizeObserver");
  });

  it("virtualizes a complete 31,100-node catalog instead of mounting every row", () => {
    const tree = buildCatalogTree(createLargeCatalog());
    const started = performance.now();
    renderWithProviders(
      <div style={{ height: 280 }}>
        <RegistrationTree
          nodes={tree}
          selectedNodeId={null}
          expandedNodeIds={new Set()}
          forceExpanded
          onSelectAndToggle={() => undefined}
          onOpenNode={() => undefined}
          onOpenContextMenu={() => undefined}
        />
      </div>,
    );
    const elapsed = performance.now() - started;
    const renderedRows = screen.getAllByRole("treeitem");
    expect(elapsed).toBeLessThan(10_000);
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(200);
    expect(screen.getByRole("tree", { name: "Registrations" })).toBeInTheDocument();
    expect(renderedRows[0]).toHaveAttribute("aria-setsize", "31100");
    fireEvent.scroll(screen.getByRole("tree"), { target: { scrollTop: 28 * 80 } });
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(200);
  });
});
