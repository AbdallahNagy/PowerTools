import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ConnectionsProvider } from "../../../../shared/connections";
import FetchXmlBuilder from "../..";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const connection = {
  name: "Main",
  envUrl: "https://example.test",
  crmType: "online" as const,
};

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

describe("FetchXML Builder table picker", () => {
  it("selects a table through SearchableSelect and still loads the filter tree", async () => {
    httpServer.use(
      http.get("http://localhost/api/metadata/entities", () =>
        HttpResponse.json([
          {
            logicalName: "account",
            displayName: "Account",
            primaryIdAttribute: "accountid",
            primaryNameAttribute: "name",
            isCustom: false,
          },
          {
            logicalName: "contact",
            displayName: "Contact",
            primaryIdAttribute: "contactid",
            primaryNameAttribute: "fullname",
            isCustom: false,
          },
        ]),
      ),
      http.get("http://localhost/api/metadata/entities/account/attributes", () =>
        HttpResponse.json([
          {
            logicalName: "name",
            displayName: "Account Name",
            attributeType: "String",
            isPrimaryId: false,
            isCustomAttribute: false,
            isInDefaultView: true,
            requiredLevel: "None",
            isValidForCreate: true,
            isValidForUpdate: true,
          },
        ]),
      ),
      http.get("http://localhost/api/metadata/entities/account/relationships", () =>
        HttpResponse.json([]),
      ),
    );

    renderWithProviders(
      <ConnectionsProvider>
        <FetchXmlBuilder />
      </ConnectionsProvider>,
      {
        bridgeOverrides: {
          getActiveConnectionName: async () => connection.name,
          getActiveConnection: async () => ({
            ...connection,
            token: "token",
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
          listConnections: async () => [connection],
          getConnection: async () => ({
            ...connection,
            token: "token",
            expiresOn: "2099-01-01T00:00:00.000Z",
          }),
        },
      },
    );

    const tableSelect = await screen.findByRole("combobox", { name: "Table" });
    await waitFor(() => expect(tableSelect).not.toBeDisabled());

    const openButton = tableSelect
      .closest(".relative")
      ?.querySelector("button[aria-haspopup='listbox']");
    expect(openButton).toBeTruthy();
    fireEvent.click(openButton!);
    await screen.findByRole("option", { name: /Account/ });
    fireEvent.keyDown(tableSelect, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByText("Select a table to build filters.")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("combobox", { name: "Table" })).toHaveValue("Account");
  });
});
