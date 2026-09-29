import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { QUERY_LIBRARY_STORAGE_KEY } from "../../model/queryLibrary";
import { SAMPLE_FETCH_XML } from "../../model/sampleQuery";
import { fetchXmlTesterTool } from "../../tool";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

const connection = {
  name: "Dev Org",
  envUrl: "https://dev.example.test",
  crmType: "online" as const,
};

const toolBridge = {
  getActiveConnectionName: async () => connection.name,
  getActiveConnection: async () => ({
    ...connection,
    token: "dev-token",
    expiresOn: "2099-01-01T00:00:00.000Z",
  }),
  listConnections: async () => [connection],
  getConnection: async () => ({
    ...connection,
    token: "dev-token",
    expiresOn: "2099-01-01T00:00:00.000Z",
  }),
};

function StatusItemsProbe() {
  const items = useStatusItems();
  return (
    <output aria-label="tool statuses">
      {items.map((item) => (
        <span key={item.id}>{item.content}</span>
      ))}
    </output>
  );
}

function renderTool() {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "fetchxml-tester-1", toolId: "fetchxml-tester", title: "FetchXML Tester" }}
          definition={fetchXmlTesterTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>
    </ConnectionsProvider>,
    { bridgeOverrides: toolBridge },
  );
}

beforeEach(() => localStorage.removeItem(QUERY_LIBRARY_STORAGE_KEY));

describe("FetchXML Tester", () => {
  it("keeps an empty query from calling Dataverse", async () => {
    renderTool();
    fireEvent.change(await screen.findByRole("textbox", { name: "FetchXML" }), {
      target: { value: "   " },
    });

    expect(screen.getByRole("button", { name: "Execute" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Run a query to see records.")).toBeInTheDocument();
  });

  it("runs the editor text unchanged and shows one page of rows", async () => {
    let requestBody: unknown;
    httpServer.use(
      http.post("http://localhost/api/fetch/execute", async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          records: [{ name: "Contoso" }],
          columns: ["name"],
          columnTypes: { name: "value" },
          moreRecords: true,
          pagingCookie: "<cookie page=\"1\" />",
          totalEstimate: null,
        });
      }),
    );

    renderTool();
    fireEvent.click(await screen.findByRole("button", { name: "Execute" }));

    expect(await screen.findByText("Contoso")).toBeInTheDocument();
    expect(requestBody).toEqual({
      fetchXml: SAMPLE_FETCH_XML,
      preserveFetchXml: true,
      valueMode: "raw",
    });
    expect(screen.getByRole("status", { name: "tool statuses" })).toHaveTextContent(
      "Number of rows returned: 1 (More records: true)",
    );
    expect(
      within(screen.getByRole("region", { name: "Results" })).getByText(
        "Number of rows returned: 1 (More records: true)",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Show formatted values" }));
    expect(screen.getByText("Contoso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));
    await waitFor(() => expect(requestBody).toMatchObject({ valueMode: "formatted" }));
  });

  it("shows an execute failure without replacing the last grid", async () => {
    let calls = 0;
    httpServer.use(
      http.post("http://localhost/api/fetch/execute", () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({
            records: [{ name: "Contoso" }],
            columns: ["name"],
            columnTypes: { name: "value" },
            moreRecords: false,
            pagingCookie: null,
            totalEstimate: null,
          });
        }
        return HttpResponse.json(
          { error: "Invalid FetchXML: Root element must be <fetch>" },
          { status: 400 },
        );
      }),
    );

    renderTool();
    fireEvent.click(await screen.findByRole("button", { name: "Execute" }));
    expect(await screen.findByText("Contoso")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "FetchXML" }), {
      target: { value: "<nope></nope>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Execute" }));

    expect(await screen.findByText("Invalid FetchXML: Root element must be <fetch>")).toBeInTheDocument();
    expect(screen.getByText("Contoso")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "tool statuses" })).toHaveTextContent(
      "Number of rows returned: 1 (More records: false)",
    );
    expect(
      within(screen.getByRole("region", { name: "Results" })).getByText(
        "Number of rows returned: 1 (More records: false)",
      ),
    ).toBeInTheDocument();
  });

  it("formats comments, then saves and reloads the query", async () => {
    renderTool();
    const editor = await screen.findByRole("textbox", { name: "FetchXML" });
    fireEvent.change(editor, {
      target: {
        value: "<fetch><entity name=\"account\"><!-- owner --><attribute name=\"name\" /></entity></fetch>",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    expect(screen.getByRole("textbox", { name: "FetchXML" })).toHaveValue([
      "<fetch>",
      "  <entity name=\"account\">",
      "    <!-- owner -->",
      "    <attribute name=\"name\" />",
      "  </entity>",
      "</fetch>",
    ].join("\n"));

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByRole("heading", { name: "Save query" })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Query description" }), {
      target: { value: "Named accounts" },
    });
    await waitFor(() => {
      const saveButtons = screen.getAllByRole("button", { name: "Save" });
      fireEvent.click(saveButtons[saveButtons.length - 1]!);
      expect(screen.getByText("Query saved.")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Search saved queries"), {
      target: { value: "Named accounts" },
    });
    expect(screen.getByText("account")).toBeInTheDocument();
    fireEvent.click(screen.getByText("account"));
    fireEvent.change(screen.getByRole("textbox", { name: "FetchXML" }), {
      target: { value: "<fetch><entity name=\"contact\" /></fetch>" },
    });
    fireEvent.click(screen.getByText("account"));
    expect(
      (screen.getByRole("textbox", { name: "FetchXML" }) as HTMLTextAreaElement).value,
    ).toContain("<!-- owner -->");

    fireEvent.click(screen.getByRole("button", { name: "Delete account saved query" }));
    expect(screen.getByText("No matching queries")).toBeInTheDocument();
  });
});
