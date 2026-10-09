import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { translatorTool } from "../../tool";
import {
  accountColumnRows,
  accountTableRows,
  completedJob,
  globalRows,
  languagesFixture,
  publishersFixture,
  solutionsFixture,
  tablesFixture,
} from "../fixtures";
import type { ApplyJob, ApplyRequest, LabelQueryRequest, LabelRow, PublishTargets } from "../../model/types";
import type { DesktopBridgeOverrides } from "../../../../../../test/support/desktopBridge";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

const API = "http://localhost/api";

const connection = {
  name: "Dev Org",
  envUrl: "https://dev.example.test",
  crmType: "online" as const,
};

const toolBridge = {
  getActiveConnectionName: async () => connection.name,
  getActiveConnection: async () => ({ ...connection, token: "dev-token", expiresOn: "2099-01-01T00:00:00.000Z" }),
  listConnections: async () => [connection],
  getConnection: async () => ({ ...connection, token: "dev-token", expiresOn: "2099-01-01T00:00:00.000Z" }),
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

function renderTool(bridgeOverrides: DesktopBridgeOverrides = toolBridge, connectionName: string | null = connection.name) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "translator-test", toolId: "translator", title: "Translator", connectionName }}
          definition={translatorTool}
        />
        <StatusItemsProbe />
      </StatusBarProvider>
    </ConnectionsProvider>,
    { bridgeOverrides },
  );
}

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));
afterAll(() => vi.unstubAllGlobals());

const rowsByKind: Record<string, LabelRow[]> = {
  table: accountTableRows,
  column: accountColumnRows,
  globalChoice: globalRows,
};

const queries: LabelQueryRequest[] = [];
const tableRequests: (string | null)[] = [];

function baseHandlers() {
  return [
    http.get(`${API}/translator/languages`, () => HttpResponse.json(languagesFixture)),
    http.get(`${API}/translator/tables`, ({ request }) => {
      tableRequests.push(new URL(request.url).searchParams.get("solutionId"));
      return HttpResponse.json({ tables: tablesFixture });
    }),
    http.get(`${API}/translator/solutions`, () => HttpResponse.json({ solutions: solutionsFixture })),
    http.get(`${API}/translator/publishers`, () => HttpResponse.json({ publishers: publishersFixture })),
    http.post(`${API}/translator/labels/query`, async ({ request }) => {
      const body = (await request.json()) as LabelQueryRequest;
      queries.push(body);
      return HttpResponse.json({ rows: rowsByKind[body.kinds[0]!] ?? [] });
    }),
  ];
}

function applyHandlers(job: ApplyJob, sent: ApplyRequest[] = [], published: PublishTargets[] = []) {
  return [
    http.post(`${API}/translator/labels/apply`, async ({ request }) => {
      sent.push((await request.json()) as ApplyRequest);
      return HttpResponse.json({ jobId: "job-1" });
    }),
    http.get(`${API}/translator/jobs/job-1`, () => HttpResponse.json(job)),
    http.post(`${API}/translator/publish`, async ({ request }) => {
      published.push((await request.json()) as PublishTargets);
      return HttpResponse.json({ status: "succeeded", count: 1, message: null });
    }),
  ];
}

async function openAccount() {
  renderTool();
  fireEvent.click(await screen.findByRole("button", { name: /^Account\s*account/ }));
  return screen.findByRole("textbox", { name: "Account Display Name French (1036)" });
}

describe("Translator", () => {
  beforeEach(() => {
    queries.length = 0;
    tableRequests.length = 0;
    httpServer.use(...baseHandlers());
  });

  it("asks for an environment and loads nothing", async () => {
    let calls = 0;
    httpServer.use(http.get(`${API}/translator/languages`, () => {
      calls += 1;
      return HttpResponse.json(languagesFixture);
    }));
    renderTool({ ...toolBridge, getActiveConnectionName: async () => null }, null);

    expect(await screen.findByText("Right-click this tab and choose Change connection.")).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("No environment selected");
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
    expect(calls).toBe(0);
  });

  it("lists tables and global choices, then shows one column per language with the base first", async () => {
    renderTool();

    expect(await screen.findByRole("button", { name: /^Global choices\s*2/ })).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("2 tables, 3 languages");
    expect(screen.getByText("Select a table or Global choices to see its labels.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Languages (3 of 3)" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /^Account\s*account/ }));
    await screen.findByRole("textbox", { name: "Account Display Name French (1036)" });

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers).toEqual(["Component", "Label", "English (1033)Base", "French (1036)", "German (1031)"]);
    expect(screen.getByRole("textbox", { name: "Account Display Name French (1036)" })).toHaveValue("Compte");
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("account: 3 labels");
    expect(queries[queries.length - 1]).toEqual({
      tables: ["account"],
      kinds: ["table"],
      lcids: [1031, 1033, 1036],
      properties: "both",
    });
  });

  it("tracks edits per cell, table, and tab, and blocks an empty base name", async () => {
    const french = await openAccount();

    fireEvent.change(french, { target: { value: "Compte client" } });
    expect(french).toHaveClass("bg-accent-soft");
    expect(screen.getByRole("button", { name: "Apply 1 change" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Account\s*account\s*1 edited/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Table\s*1$/ })).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("1 unsaved change");

    const english = screen.getByRole("textbox", { name: "Account Display Name English (1033)" });
    fireEvent.change(english, { target: { value: "" } });
    expect(english).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Apply 2 changes" })).toBeDisabled();

    fireEvent.change(english, { target: { value: "Account" } });
    expect(english).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Apply 1 change" })).toBeEnabled();
  });

  it("keeps drafts across component tabs and shows read-only rows as text", async () => {
    const french = await openAccount();
    fireEvent.change(french, { target: { value: "Compte client" } });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Columns" }));
    fireEvent.click(screen.getByRole("tab", { name: "Columns" }));
    expect(await screen.findByRole("textbox", { name: "Account Name Display Name French (1036)" })).toHaveValue(
      "Nom du compte",
    );
    expect(screen.queryByRole("textbox", { name: /^Created On/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Created On Display Name English \(1033\): Created On\. This column cannot be renamed\./)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Table\s*1$/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^Table\s*1$/ }));
    expect(await screen.findByRole("textbox", { name: "Account Display Name French (1036)" })).toHaveValue(
      "Compte client",
    );
  });

  it("filters rows and hides languages without losing drafts", async () => {
    const french = await openAccount();
    fireEvent.change(french, { target: { value: "Compte client" } });

    fireEvent.change(screen.getByRole("textbox", { name: "Filter labels" }), { target: { value: "zzz" } });
    expect(screen.getByText('No labels match "zzz".')).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter labels" }), { target: { value: "" } });

    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), { target: { value: "descriptions" } });
    expect(screen.queryByRole("textbox", { name: "Account Display Name French (1036)" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), { target: { value: "both" } });

    fireEvent.click(screen.getByRole("button", { name: "Languages (3 of 3)" }));
    const dialog = await screen.findByRole("dialog", { name: "Languages" });
    expect(within(dialog).getByRole("checkbox", { name: "English (1033)" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Base language only" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Languages (1 of 3)" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "French (1036)" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply 1 change" })).toBeEnabled();
  });

  it("applies changes, publishes only the listed tables, and shows the saved value", async () => {
    const sent: ApplyRequest[] = [];
    const key = accountTableRows[0]!.key;
    httpServer.use(...applyHandlers(
      completedJob({
        processed: 1,
        total: 1,
        succeeded: 1,
        results: [{ key, lcids: [1036], outcome: "succeeded", message: null }],
      }),
      sent,
    ));
    const french = await openAccount();
    fireEvent.change(french, { target: { value: "Compte client" } });

    fireEvent.click(screen.getByRole("button", { name: "Apply 1 change" }));
    const dialog = await screen.findByRole("dialog", { name: "Apply label changes" });
    expect(within(dialog).getByText("account: 1 label")).toBeInTheDocument();
    expect(within(dialog).getByText("Only the tables and global choices listed here are published.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply and publish" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sent).toEqual([{ rows: [{ key, labels: { 1036: "Compte client" } }] }]);
    expect(document.querySelector("[data-toast-type='success']")).toHaveTextContent(
      "Updated 1 label and published 1 component.",
    );
    const saved = screen.getByRole("textbox", { name: "Account Display Name French (1036)" });
    expect(saved).toHaveValue("Compte client");
    expect(saved).not.toHaveClass("bg-accent-soft");
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  });

  it("keeps failed cells as drafts and lists them, then retries a failed publish", async () => {
    const published: PublishTargets[] = [];
    const display = accountTableRows[0]!.key;
    const plural = accountTableRows[1]!.key;
    httpServer.use(...applyHandlers(
      completedJob({
        processed: 2,
        total: 2,
        succeeded: 1,
        failed: 1,
        results: [
          { key: display, lcids: [1036], outcome: "succeeded", message: null },
          { key: plural, lcids: [1036], outcome: "failed", message: "Principal user is missing prvWriteEntity." },
        ],
        publish: {
          status: "failed",
          targets: { tables: ["account"], optionSets: [] },
          message: "Another publish is running.",
        },
      }),
      [],
      published,
    ));
    const french = await openAccount();
    fireEvent.change(french, { target: { value: "Compte client" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Account Plural Name French (1036)" }), {
      target: { value: "Comptes" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply 2 changes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply and publish" }));

    const dialog = await screen.findByRole("dialog", { name: "Apply label changes" });
    expect(await within(dialog).findByText("1 of 2 labels updated. 1 failed.")).toBeInTheDocument();
    expect(within(dialog).getByText("Labels were saved but publishing failed: Another publish is running.")).toBeInTheDocument();
    expect(within(dialog).getByText("Principal user is missing prvWriteEntity.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry publish" }));
    await waitFor(() => expect(published).toEqual([{ tables: ["account"], optionSets: [] }]));
    await waitFor(() =>
      expect(within(dialog).queryByText(/publishing failed/)).not.toBeInTheDocument(),
    );
    const close = within(dialog).getAllByRole("button", { name: "Close" }).find((button) => button.textContent === "Close");
    fireEvent.click(close!);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Account Plural Name French (1036)" })).toHaveClass("bg-danger-soft");
    expect(screen.getByRole("button", { name: "Apply 1 change" })).toBeEnabled();
  });

  it("asks before discarding and before reloading over unsaved edits", async () => {
    const french = await openAccount();
    fireEvent.change(french, { target: { value: "Compte client" } });

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    const discard = await screen.findByRole("dialog", { name: "Discard changes" });
    expect(within(discard).getByText("Discard 1 unsaved label change?")).toBeInTheDocument();
    fireEvent.click(within(discard).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Account Display Name French (1036)" })).toHaveValue("Compte");

    fireEvent.change(screen.getByRole("textbox", { name: "Account Display Name French (1036)" }), {
      target: { value: "Compte client" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reload labels" }));
    const reload = await screen.findByRole("dialog", { name: "Reload labels" });
    expect(within(reload).getByText("Reloading discards 1 unsaved change.")).toBeInTheDocument();
    const before = queries.length;
    fireEvent.click(within(reload).getByRole("button", { name: "Discard and reload" }));
    await waitFor(() => expect(queries.length).toBeGreaterThan(before));
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  });

  it("shows global choices without component tabs", async () => {
    renderTool();
    fireEvent.click(await screen.findByRole("button", { name: /^Global choices/ }));

    expect(await screen.findByRole("textbox", { name: "Flag True Label French (1036)" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers.slice(0, 3)).toEqual(["Component", "Value", "Label"]);
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Global choices: 2 choices");
  });

  it("shows an error with Retry when labels cannot load", async () => {
    let fail = true;
    httpServer.use(http.post(`${API}/translator/labels/query`, async ({ request }) => {
      const body = (await request.json()) as LabelQueryRequest;
      if (fail && body.kinds[0] === "table") {
        return HttpResponse.json({ code: "privilege_denied", message: "Missing prvReadEntity." }, { status: 403 });
      }
      return HttpResponse.json({ rows: rowsByKind[body.kinds[0]!] ?? [] });
    }));
    renderTool();
    fireEvent.click(await screen.findByRole("button", { name: /^Account\s*account/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Missing prvReadEntity.");
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Could not load table labels for account");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("textbox", { name: "Account Display Name French (1036)" })).toBeInTheDocument();
  });
  it("limits tables and labels to the chosen solution and hides the add-to-solution option", async () => {
    httpServer.use(http.get(`${API}/translator/tables`, ({ request }) => {
      const solutionId = new URL(request.url).searchParams.get("solutionId");
      tableRequests.push(solutionId);
      return HttpResponse.json({ tables: solutionId ? [tablesFixture[0]] : tablesFixture });
    }));
    renderTool();
    await screen.findByRole("button", { name: /^Contact\s*contact/ });

    const source = screen.getByRole("combobox", { name: "Source" });
    await waitFor(() => expect(within(source).getByRole("option", { name: "Vendor Pack (managed)" })).toBeInTheDocument());
    expect(within(source).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All tables",
      "Contoso Core",
      "Vendor Pack (managed)",
    ]);

    fireEvent.change(source, { target: { value: solutionsFixture[0]!.solutionId } });
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Contact\s*contact/ })).not.toBeInTheDocument());
    expect(tableRequests).toContain(solutionsFixture[0]!.solutionId);

    fireEvent.click(await screen.findByRole("button", { name: /^Account\s*account/ }));
    const french = await screen.findByRole("textbox", { name: "Account Display Name French (1036)" });
    expect(queries[queries.length - 1]).toMatchObject({ tables: ["account"], solutionId: solutionsFixture[0]!.solutionId });
    expect(queries.some((query) => query.kinds[0] === "globalChoice" && query.solutionId === solutionsFixture[0]!.solutionId)).toBe(true);

    fireEvent.change(french, { target: { value: "Compte client" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 change" }));
    const dialog = await screen.findByRole("dialog", { name: "Apply label changes" });
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("asks before changing the source over unsaved edits", async () => {
    const french = await openAccount();
    fireEvent.change(french, { target: { value: "Compte client" } });
    const source = screen.getByRole("combobox", { name: "Source" });
    await waitFor(() => expect(within(source).getAllByRole("option")).toHaveLength(3));

    fireEvent.change(source, { target: { value: solutionsFixture[0]!.solutionId } });
    const confirm = await screen.findByRole("dialog", { name: "Change source" });
    expect(within(confirm).getByText("Changing the source discards 1 unsaved change.")).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Apply 1 change" })).toBeEnabled();
    expect(source).toHaveValue("");

    fireEvent.change(source, { target: { value: solutionsFixture[0]!.solutionId } });
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Change source" })).getByRole("button", { name: "Discard and change" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled());
    expect(screen.getByText("Select a table or Global choices to see its labels.")).toBeInTheDocument();
  });

  it("adds the changed components to an existing unmanaged solution", async () => {
    const sent: ApplyRequest[] = [];
    let solutionRequests = 0;
    httpServer.use(
      http.get(`${API}/translator/solutions`, () => {
        solutionRequests += 1;
        return HttpResponse.json({ solutions: solutionsFixture });
      }),
    );
    const key = accountTableRows[0]!.key;
    httpServer.use(...applyHandlers(
      completedJob({
        processed: 1,
        total: 1,
        succeeded: 1,
        results: [{ key, lcids: [1036], outcome: "succeeded", message: null }],
        solution: {
          status: "succeeded",
          uniqueName: "ContosoCore",
          friendlyName: "Contoso Core",
          created: false,
          added: 1,
          failed: 0,
          message: null,
          failures: [],
        },
      }),
      sent,
    ));
    const french = await openAccount();
    fireEvent.change(french, { target: { value: "Compte client" } });

    fireEvent.click(screen.getByRole("button", { name: "Apply 1 change" }));
    const dialog = await screen.findByRole("dialog", { name: "Apply label changes" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Add changed components to a solution" }));
    const apply = within(dialog).getByRole("button", { name: "Apply and publish" });
    expect(apply).toBeDisabled();
    // Required errors wait until the user has touched the field.
    expect(within(dialog).queryByText("Choose a solution.")).not.toBeInTheDocument();

    const picker = within(dialog).getByRole("combobox", { name: "Unmanaged solution" });
    fireEvent.blur(picker);
    expect(within(dialog).getByText("Choose a solution.")).toBeInTheDocument();
    expect(within(picker).queryByRole("option", { name: "Vendor Pack" })).not.toBeInTheDocument();
    fireEvent.change(picker, { target: { value: "ContosoCore" } });
    expect(apply).toBeEnabled();
    const solutionsBeforeApply = solutionRequests;
    fireEvent.click(apply);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sent).toEqual([{ rows: [{ key, labels: { 1036: "Compte client" } }], solution: { uniqueName: "ContosoCore" } }]);
    // Components were added, so the cached solution list is refetched for the source picker.
    await waitFor(() => expect(solutionRequests).toBeGreaterThan(solutionsBeforeApply));
    expect(document.querySelector("[data-toast-type='success']")).toHaveTextContent(
      "Updated 1 label and published 1 component. Added 1 component to Contoso Core.",
    );
  });

  it("creates a new solution from the apply confirmation and reports a failed add separately", async () => {
    const sent: ApplyRequest[] = [];
    const key = accountTableRows[0]!.key;
    httpServer.use(...applyHandlers(
      completedJob({
        processed: 1,
        total: 1,
        succeeded: 1,
        results: [{ key, lcids: [1036], outcome: "succeeded", message: null }],
        solution: {
          status: "failed",
          uniqueName: "LabelsFR",
          friendlyName: "Labels FR",
          created: true,
          added: 0,
          failed: 1,
          message: "Principal user is missing prvAppendToSolution.",
          failures: [{ componentType: 1, component: "account", message: "Principal user is missing prvAppendToSolution." }],
        },
      }),
      sent,
    ));
    const french = await openAccount();
    fireEvent.change(french, { target: { value: "Compte client" } });

    fireEvent.click(screen.getByRole("button", { name: "Apply 1 change" }));
    const dialog = await screen.findByRole("dialog", { name: "Apply label changes" });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Add changed components to a solution" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "New solution" }));
    expect(within(dialog).queryByText("Enter a display name.")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Enter a unique name.")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Choose a publisher.")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Display name" }), { target: { value: "Labels FR" } });
    expect(within(dialog).getByRole("textbox", { name: "Unique name" })).toHaveValue("LabelsFR");
    expect(within(dialog).getByRole("textbox", { name: "Version" })).toHaveValue("1.0.0.0");
    const apply = within(dialog).getByRole("button", { name: "Apply and publish" });
    expect(apply).toBeDisabled();

    const publisher = within(dialog).getByRole("combobox", { name: "Publisher" });
    await waitFor(() => expect(within(publisher).getByRole("option", { name: "Contoso (cr1)" })).toBeInTheDocument());
    fireEvent.change(publisher, { target: { value: publishersFixture[0]!.publisherId } });
    fireEvent.click(apply);

    expect(await within(dialog).findByText(
      "Labels were saved but adding components to Labels FR failed: Principal user is missing prvAppendToSolution.",
    )).toBeInTheDocument();
    expect(within(dialog).getByRole("columnheader", { name: "Solution component" })).toBeInTheDocument();
    expect(sent[0]!.solution).toEqual({
      new: {
        friendlyName: "Labels FR",
        uniqueName: "LabelsFR",
        publisherId: publishersFixture[0]!.publisherId,
        version: "1.0.0.0",
      },
    });
    const close = within(dialog).getAllByRole("button", { name: "Close" }).find((button) => button.textContent === "Close");
    fireEvent.click(close!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Account Display Name French (1036)" })).toHaveValue("Compte client");
    expect(screen.getByRole("button", { name: "Apply changes" })).toBeDisabled();
  });

  it("keeps the source picker usable when tables fail to load", async () => {
    httpServer.use(http.get(`${API}/translator/tables`, () =>
      HttpResponse.json({ code: "dataverse_error", message: "Metadata read failed." }, { status: 400 })));
    renderTool();

    expect(await screen.findByText("Metadata read failed.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Source" })).toBeEnabled();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Could not load languages and tables");
  });
});
