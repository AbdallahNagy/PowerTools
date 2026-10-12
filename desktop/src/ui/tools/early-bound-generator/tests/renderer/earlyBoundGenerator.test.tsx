import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { earlyBoundGeneratorTool } from "../../tool";
import type { FolderInfo, GenerationJob, GenerationRequest } from "../../model/types";
import { emptyFolder, generatedFiles, runningJob, succeededJob, tableNamesFixture } from "../fixtures";
import type { DesktopBridgeOverrides } from "../../../../../../test/support/desktopBridge";
import { codeEditorValue } from "../../../../../../test/support/codeEditor";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

const API = "http://localhost/api/early-bound-generator";
const FOLDER = "C:\\src\\Contoso.Model";

const connection = {
  name: "Dev Org",
  envUrl: "https://dev.example.test",
  crmType: "online" as const,
};

const authed = { ...connection, token: "dev-token", expiresOn: "2099-01-01T00:00:00.000Z" };

function toolBridge(overrides: DesktopBridgeOverrides = {}): DesktopBridgeOverrides {
  return {
    getActiveConnectionName: async () => connection.name,
    getActiveConnection: async () => authed,
    listConnections: async () => [connection],
    getConnection: async () => authed,
    selectDirectory: async () => FOLDER,
    ...overrides,
  };
}

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

function renderTool(bridgeOverrides: DesktopBridgeOverrides = toolBridge(), connectionName: string | null = connection.name) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "ebg-test", toolId: "early-bound-generator", title: "Early Bound Generator", connectionName }}
          definition={earlyBoundGeneratorTool}
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

const sent: GenerationRequest[] = [];
let tableCalls = 0;

function handlers(options: { folder?: FolderInfo; jobs?: GenerationJob[]; start?: () => Response } = {}) {
  const jobs = [...(options.jobs ?? [runningJob(FOLDER), succeededJob(FOLDER)])];
  return [
    http.get(`${API}/tables`, () => {
      tableCalls += 1;
      return HttpResponse.json(tableNamesFixture);
    }),
    http.get(`${API}/folder`, ({ request }) => {
      const path = new URL(request.url).searchParams.get("path") ?? "";
      return HttpResponse.json(options.folder ?? emptyFolder(path));
    }),
    http.post(`${API}/jobs`, async ({ request }) => {
      sent.push((await request.json()) as GenerationRequest);
      return options.start ? options.start() : HttpResponse.json({ jobId: "job-1" });
    }),
    http.get(`${API}/jobs/job-1`, () => HttpResponse.json(jobs.length > 1 ? jobs.shift() : jobs[0])),
  ];
}

function generateButton() {
  return screen.getByRole("button", { name: /^Generate/ });
}

function pacCommand() {
  return codeEditorValue(screen.getByLabelText("pac command"));
}

async function chooseFolder() {
  fireEvent.click(screen.getByRole("button", { name: "Choose folder..." }));
  await waitFor(() => expect(screen.getByLabelText("Output folder")).toHaveValue(FOLDER));
}

describe("Early Bound Generator", () => {
  beforeEach(() => {
    sent.length = 0;
    tableCalls = 0;
    httpServer.use(...handlers());
  });

  it("keeps the form editable without an environment and explains why Generate is off", async () => {
    renderTool(toolBridge({ getActiveConnectionName: async () => null }), null);

    expect(await screen.findByText("Connect to an environment to generate code.")).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
    expect(screen.getByLabelText("Connect to an environment first.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Namespace"), { target: { value: "Contoso.Model" } });
    await waitFor(() => expect(pacCommand()).toContain("--namespace Contoso.Model"));
    expect(tableCalls).toBe(0);
  });

  it("updates the pac command as settings change and copies it", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderTool();

    await waitFor(() => expect(pacCommand()).toContain('--outdirectory "<output folder>"'));
    expect(pacCommand()).not.toContain("--generatesdkmessages");

    fireEvent.click(screen.getByLabelText("Generate message classes"));
    fireEvent.change(screen.getByLabelText("Messages to generate"), { target: { value: "new_%" } });
    fireEvent.click(screen.getByLabelText("Entity type codes"));

    await waitFor(() => expect(pacCommand()).toContain('--generatesdkmessages --messagenamesfilter "new_*"'));
    expect(pacCommand()).toContain("--emitentityetc");

    fireEvent.click(screen.getByRole("button", { name: "Copy command" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(pacCommand()));
    expect(await screen.findByText("Command copied.")).toBeInTheDocument();
  });

  it("warns that an empty table list generates every table", async () => {
    renderTool();

    expect(
      await screen.findByText(/Every table in the environment will be generated/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account" } });
    await waitFor(() => expect(screen.queryByText(/Every table in the environment/)).not.toBeInTheDocument());
  });

  it("expands wildcards, generates, polls, and lists the written files", async () => {
    const openPath = vi.fn(async () => ({ success: true }));
    renderTool(toolBridge({ openPath }));

    expect(generateButton()).toBeDisabled();
    await chooseFolder();
    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account\nnew_project*" } });
    expect(await screen.findByText(/Matches 4 tables\./)).toBeInTheDocument();
    await waitFor(() =>
      expect(pacCommand()).toContain('--entitynamesfilter "account;new_project;new_project_contact;new_projecttask"'),
    );

    await waitFor(() => expect(generateButton()).toBeEnabled());
    fireEvent.click(generateButton());

    expect(await screen.findByText(/Reading metadata and writing files/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generating/ })).toBeDisabled();
    expect(screen.getByLabelText("Namespace")).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Generating early-bound classes..."),
    );

    expect(await screen.findByText("Generated 5 files.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      outputDirectory: FOLDER,
      namespace: "DataverseModel",
      serviceContextName: "DataverseContext",
      entityNamesFilter: ["account", "new_project", "new_project_contact", "new_projecttask"],
      generateMessages: false,
      messageNamesFilter: [],
    });

    expect(screen.getByText("Done")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Generated 5 files in 1 min 12 s"),
    );
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(generatedFiles.length + 1);
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("builderSettings.json");

    fireEvent.click(within(table).getByRole("button", { name: "File" }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("OptionSets/account_industrycode.cs");

    fireEvent.change(screen.getByLabelText("Filter files"), { target: { value: "industry" } });
    expect(within(table).getAllByRole("row")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    await waitFor(() => expect(openPath).toHaveBeenCalledWith(FOLDER));
  });

  it("loads builderSettings.json from the chosen folder into the form", async () => {
    httpServer.use(
      ...handlers({
        folder: {
          ...emptyFolder(FOLDER),
          hasOtherFiles: true,
          settings: {
            namespace: "Contoso.Model",
            serviceContextName: "ContosoContext",
            entityTypesFolder: "Tables",
            optionSetsTypesFolder: null,
            messagesTypesFolder: null,
            entityNamesFilter: ["account", "contact"],
            messageNamesFilter: null,
            generateSdkMessages: null,
            generateGlobalOptionSets: true,
            emitFieldsClasses: null,
            emitVirtualAttributes: null,
            emitEntityETC: null,
            suppressINotifyPattern: null,
            suppressGeneratedCodeAttribute: null,
          },
        },
      }),
    );
    renderTool();
    await chooseFolder();

    expect(await screen.findByText("Loaded settings from builderSettings.json.")).toBeInTheDocument();
    expect(screen.getByLabelText("Namespace")).toHaveValue("Contoso.Model");
    expect(screen.getByLabelText("Service context name")).toHaveValue("ContosoContext");
    expect(screen.getByLabelText("Tables folder")).toHaveValue("Tables");
    expect(screen.getByLabelText("Tables to generate")).toHaveValue("account\ncontact");
    expect(screen.getByLabelText("Generate global choices")).toBeChecked();
  });

  it("asks once before generating into a folder that has files", async () => {
    httpServer.use(...handlers({ folder: { ...emptyFolder(FOLDER), hasOtherFiles: true } }));
    renderTool();
    await chooseFolder();
    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account" } });
    await waitFor(() => expect(generateButton()).toBeEnabled());

    fireEvent.click(generateButton());
    const dialog = await screen.findByRole("dialog", { name: "Generate into this folder?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sent).toHaveLength(0);

    fireEvent.click(generateButton());
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("Generated 5 files.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(sent).toHaveLength(1);

    fireEvent.click(generateButton());
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a plain failure with the files written before it", async () => {
    httpServer.use(
      ...handlers({
        jobs: [
          {
            ...runningJob(FOLDER),
            state: "failed",
            error: "An existing connection was forcibly closed.",
            errorKind: "connection",
            files: [generatedFiles[0]!],
            durationMs: 3000,
          },
        ],
      }),
    );
    renderTool();
    await chooseFolder();
    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account" } });
    await waitFor(() => expect(generateButton()).toBeEnabled());
    fireEvent.click(generateButton());

    expect(
      await screen.findByText("The connection to Dev Org was lost. Reconnect and select Generate again.", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Generation failed.")).toBeInTheDocument();
    expect(screen.getByText("1 file was written before the failure.")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Entities/account.cs")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Generation failed"));
    expect(screen.getByLabelText("Tables to generate")).toHaveValue("account");
  });

  it("shows the server's message when another generation is running", async () => {
    httpServer.use(
      ...handlers({
        start: () =>
          HttpResponse.json(
            { code: "busy", message: "Another generation is running. Wait for it to finish, then select Generate again." },
            { status: 409 },
          ),
      }),
    );
    renderTool();
    await chooseFolder();
    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account" } });
    await waitFor(() => expect(generateButton()).toBeEnabled());
    fireEvent.click(generateButton());

    expect(await screen.findByText(/Another generation is running/)).toBeInTheDocument();
  });

  it("warns when the filters matched nothing", async () => {
    httpServer.use(
      ...handlers({
        jobs: [succeededJob(FOLDER, generatedFiles.filter((file) => file.kind === "Settings"))],
      }),
    );
    renderTool();
    await chooseFolder();
    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account" } });
    await waitFor(() => expect(generateButton()).toBeEnabled());
    fireEvent.click(generateButton());

    expect(
      await screen.findByText("No tables or messages matched the filters. Check the names and wildcards.", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("blocks Generate for unknown tables and invalid settings", async () => {
    renderTool();
    await chooseFolder();

    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account\nnew_gone\nzzz_*" } });
    expect(await screen.findByText("Not found in this environment: new_gone.")).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
    expect(screen.getByLabelText("Fix the settings marked in red first.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account" } });
    fireEvent.change(screen.getByLabelText("Tables folder"), { target: { value: "../Entities" } });
    expect(
      await screen.findByText("Enter a folder name relative to the output folder, without .. or a drive."),
    ).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Tables folder"), { target: { value: "Entities" } });
    fireEvent.change(screen.getByLabelText("Namespace"), { target: { value: "1Bad" } });
    expect(await screen.findByText("Enter a valid C# namespace, such as Contoso.Model.")).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it("shows an unreadable builderSettings.json and keeps the form", async () => {
    httpServer.use(...handlers({ folder: { ...emptyFolder(FOLDER), settingsError: "Unexpected end of JSON" } }));
    renderTool();
    await chooseFolder();

    expect(
      await screen.findByText(
        "builderSettings.json could not be read: Unexpected end of JSON. The form keeps its current values, and the file is replaced on the next successful run.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Namespace")).toHaveValue("DataverseModel");
  });

  it("clears results when the environment changes and keeps the settings", async () => {
    const view = renderTool();
    await chooseFolder();
    fireEvent.change(screen.getByLabelText("Tables to generate"), { target: { value: "account" } });
    await waitFor(() => expect(generateButton()).toBeEnabled());
    fireEvent.click(generateButton());
    expect(await screen.findByText("Generated 5 files.", {}, { timeout: 4000 })).toBeInTheDocument();

    view.rerender(
      <ConnectionsProvider>
        <StatusBarProvider>
          <ToolHost
            tab={{ id: "ebg-test", toolId: "early-bound-generator", title: "Early Bound Generator", connectionName: "Test Org" }}
            definition={earlyBoundGeneratorTool}
          />
        </StatusBarProvider>
      </ConnectionsProvider>,
    );

    expect(
      await screen.findByText("Environment changed. Select Generate to rebuild from Test Org."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tables to generate")).toHaveValue("account");
    expect(screen.getByLabelText("Output folder")).toHaveValue(FOLDER);
  });
});
