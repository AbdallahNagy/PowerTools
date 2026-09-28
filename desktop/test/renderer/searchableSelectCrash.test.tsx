import { StrictMode, Component, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SearchableSelect } from "../../src/ui/shared/ui";
import { ToolErrorBoundary } from "../../src/ui/shell/tool-runtime/ToolErrorBoundary";
import { FieldPicker } from "../../src/ui/tools/fetchxml-builder/components/filter-builder/FieldPicker";
import type { EntityInfo } from "../../src/ui/shared/contracts/dataverse";
import type {
  FieldMetadata,
  RelationshipMetadata,
} from "../../src/ui/tools/fetchxml-builder/model/types";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class CaptureBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <output aria-label="crash">{this.state.error.message}</output>;
    }
    return this.props.children;
  }
}

const account: EntityInfo = {
  logicalName: "account",
  displayName: "Account",
  primaryIdAttribute: "accountid",
  primaryNameAttribute: "name",
  isCustom: false,
};

const contact: EntityInfo = {
  logicalName: "contact",
  displayName: "Contact",
  primaryIdAttribute: "contactid",
  primaryNameAttribute: "fullname",
  isCustom: false,
};

const nameField: FieldMetadata = {
  logicalName: "name",
  displayName: "Account Name",
  attributeType: "String",
  isPrimaryId: false,
  isCustomAttribute: false,
  isInDefaultView: true,
  requiredLevel: "None",
  isValidForCreate: true,
  isValidForUpdate: true,
};

const relationship: RelationshipMetadata = {
  schemaName: "account_primary_contact",
  relationshipType: "many-to-one",
  sourceEntity: "account",
  targetEntity: "contact",
  sourceAttribute: "primarycontactid",
  targetAttribute: "contactid",
  displayName: "Primary Contact",
  isCustomRelationship: false,
};

function CrashHarness({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <CaptureBoundary>
        <ToolErrorBoundary toolTitle="FetchXML Builder">
          <div className="overflow-hidden" style={{ height: 400, width: 400 }}>
            {children}
          </div>
        </ToolErrorBoundary>
      </CaptureBoundary>
    </StrictMode>
  );
}

function expectNoCrash() {
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("crash")).not.toBeInTheDocument();
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 288,
      height: 32,
      top: 0,
      left: 0,
      right: 288,
      bottom: 32,
      toJSON() {
        return {};
      },
    }) as DOMRect;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("SearchableSelect click crash regression", () => {
  it("opens the table picker from the combobox and chevron without crashing", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <CrashHarness>
        <SearchableSelect
          aria-label="Table"
          value=""
          onChange={() => undefined}
          options={[
            { value: "account", label: "Account", description: "account" },
            { value: "contact", label: "Contact", description: "contact" },
          ]}
          placeholder="— select a table —"
          searchPlaceholder="Search tables…"
        />
      </CrashHarness>,
    );

    await user.click(screen.getByRole("combobox", { name: "Table" }));
    expectNoCrash();
    expect(await screen.findByRole("option", { name: /Account/ })).toBeInTheDocument();

    await user.keyboard("cont");
    expectNoCrash();
    expect(await screen.findByRole("option", { name: /Contact/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Account/ })).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open options" }));
    expectNoCrash();
    expect(await screen.findByRole("option", { name: /Account/ })).toBeInTheDocument();

    const maxUpdate = consoleError.mock.calls.some((args) =>
      args.some((arg) => String(arg).includes("Maximum update depth exceeded")),
    );
    const renderHandler = consoleError.mock.calls.some((args) =>
      args.some((arg) => String(arg).includes("Cannot call an event handler while rendering")),
    );
    consoleError.mockRestore();
    expect(maxUpdate).toBe(false);
    expect(renderHandler).toBe(false);
  });

  it("opens FieldPicker without crashing and keeps search", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <CrashHarness>
        <FieldPicker
          value={null}
          fields={[nameField]}
          tables={[account, contact]}
          relationships={[relationship]}
          path={[]}
          allowRelationships
          onChange={() => undefined}
          onSelectRelationship={() => undefined}
        />
      </CrashHarness>,
    );

    await user.click(screen.getByRole("combobox", { name: "Field" }));
    expectNoCrash();
    expect(await screen.findByRole("option", { name: /Account Name/ })).toBeInTheDocument();

    await user.keyboard("zzzz");
    expect(await screen.findByText("No matches")).toBeInTheDocument();
    expectNoCrash();

    await user.keyboard("{Escape}");
    fireEvent.click(screen.getByRole("button", { name: "Open options" }));
    expectNoCrash();
    expect(await screen.findByRole("option", { name: /Account Name/ })).toBeInTheDocument();

    const renderHandler = consoleError.mock.calls.some((args) =>
      args.some((arg) => String(arg).includes("Cannot call an event handler while rendering")),
    );
    consoleError.mockRestore();
    expect(renderHandler).toBe(false);
  });
});
