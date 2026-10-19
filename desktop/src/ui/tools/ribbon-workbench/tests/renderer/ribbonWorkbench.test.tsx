import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { legacyConnection } from "../../../../../../test/support/desktopBridge";
import type { DesktopBridgeOverrides } from "../../../../../../test/support/desktopBridge";
import { httpServer } from "../../../../../../test/support/httpServer";
import { renderWithProviders } from "../../../../../../test/support/render";

import { ConnectionsProvider } from "../../../../shared/connections";
import { StatusBarProvider, useStatusItems } from "../../../../shared/status";
import ToolHost from "../../../../shell/tool-runtime/ToolHost";
import { ribbonWorkbenchTool } from "../../tool";
import type { DiffsRequest, LoadResponse, Problem, PublishJob, PublishRequest } from "../../model/types";
import { accountBase, applicationBase, job, loadFixture, solutionsFixture } from "../fixtures";

const API = "http://localhost/api/ribbon-workbench";
const connection = legacyConnection("Dev Org", "https://dev.example.test", "online");

const toolBridge = {
  getActiveConnectionId: async () => connection.id,
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

function renderTool(bridgeOverrides: DesktopBridgeOverrides = toolBridge, connectionId: string | null = connection.id) {
  return renderWithProviders(
    <ConnectionsProvider>
      <StatusBarProvider>
        <ToolHost
          tab={{ id: "ribbon-test", toolId: "ribbon-workbench", title: "Ribbon Editor", connectionId }}
          definition={ribbonWorkbenchTool}
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

let loads: string[] = [];
let baseReads: (string | null)[] = [];

function handlers(load: LoadResponse = loadFixture()) {
  return [
    http.get(`${API}/solutions`, () => HttpResponse.json(solutionsFixture)),
    http.post(`${API}/load`, async ({ request }) => {
      loads.push(((await request.json()) as { solutionUniqueName: string }).solutionUniqueName);
      return HttpResponse.json(load);
    }),
    http.get(`${API}/base-ribbon`, ({ request }) => {
      const entity = new URL(request.url).searchParams.get("entity");
      baseReads.push(entity);
      return HttpResponse.json(entity === "account" ? accountBase() : applicationBase());
    }),
  ];
}

/** A tree row by the id it shows. Tree item names include their children, so look up by the id text. */
function treeItem(id: string): HTMLElement {
  return screen.getByText(id, { selector: "span" }).closest("li") as HTMLElement;
}

/** Radix tabs switch on mousedown. */
function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });
}

async function loadSolution(user = userEvent.setup(), render = true) {
  if (render) renderTool();
  const select = await screen.findByLabelText("Solution");
  await waitFor(() => expect(within(select).getByRole("option", { name: "Ribbon edits (new_RibbonEdits)" })).toBeInTheDocument());
  await user.selectOptions(select, "new_RibbonEdits");
  await user.click(screen.getByRole("button", { name: "Load" }));
  await screen.findByRole("list", { name: "Tables" });
  return user;
}

async function openAccount(user = userEvent.setup()) {
  await loadSolution(user);
  await user.click(screen.getByRole("button", { name: /^Account\s*account/ }));
  await screen.findByText("new.account.Hello.Button");
  return user;
}

/** Radix opens the menu on pointerdown, which jsdom does not send, so open it from the keyboard. */
async function openMenu(_user: ReturnType<typeof userEvent.setup>, label: string) {
  const trigger = screen.getByRole("button", { name: `Actions for ${label}` });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.findByRole("menu");
}

describe("Ribbon Editor", () => {
  beforeEach(() => {
    loads = [];
    baseReads = [];
    httpServer.use(...handlers());
  });

  it("asks for an environment and loads nothing without one", async () => {
    let calls = 0;
    httpServer.use(http.get(`${API}/solutions`, () => {
      calls += 1;
      return HttpResponse.json(solutionsFixture);
    }));
    renderTool({ ...toolBridge, getActiveConnectionId: async () => null }, null);

    expect(await screen.findByText("Connect to an environment to edit command bars.")).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("No environment selected");
    expect(calls).toBe(0);
  });

  it("explains an environment with no unmanaged solutions", async () => {
    httpServer.use(http.get(`${API}/solutions`, () => HttpResponse.json({ solutions: [] })));
    renderTool();

    expect(await screen.findByText(/No unmanaged solutions in this environment/)).toBeInTheDocument();
  });

  it("shows a solution created after the list was read when Refresh is clicked", async () => {
    const user = userEvent.setup();
    let solutions = solutionsFixture.solutions;
    httpServer.use(http.get(`${API}/solutions`, () => HttpResponse.json({ solutions })));
    renderTool();
    const select = await screen.findByLabelText("Solution");
    await waitFor(() => expect(within(select).getByRole("option", { name: "Ribbon edits (new_RibbonEdits)" })).toBeInTheDocument());
    expect(within(select).queryByRole("option", { name: "Brand new (new_BrandNew)" })).not.toBeInTheDocument();

    solutions = [...solutions, { id: "s3", uniqueName: "new_BrandNew", friendlyName: "Brand new", publisherPrefix: "new", version: "1.0.0.0" }];
    await user.click(screen.getByRole("button", { name: "Refresh solutions" }));

    expect(await within(select).findByRole("option", { name: "Brand new (new_BrandNew)" })).toBeInTheDocument();
  });

  it("loads a solution and lists the application ribbon first, then its tables", async () => {
    renderTool();
    expect(await screen.findByText("Choose an unmanaged solution, then Load, to see its tables and command bars.")).toBeInTheDocument();
    await loadSolution(userEvent.setup(), false);

    expect(loads).toEqual(["new_RibbonEdits"]);
    const rows = within(screen.getByRole("list", { name: "Tables" })).getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Application ribbon",
      "Accountaccount",
      "Contactcontact",
      "QueuequeueNo command bar",
    ]);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByLabelText("tool statuses")).toHaveTextContent("new_RibbonEdits: 3 tables");
    expect(await screen.findByText("Advanced find")).toBeInTheDocument();
  });

  it("shows the table's command bar with the solution's button once and labels resolved", async () => {
    await openAccount();

    expect(screen.getAllByText("new.account.Hello.Button")).toHaveLength(1);
    const hello = treeItem("new.account.Hello.Button");
    expect(within(hello).getByText("Hello")).toBeInTheDocument();
    expect(within(hello).getByText("Custom")).toBeInTheDocument();
    expect(baseReads).toContain("account");
  });

  it("does not read the command bar of a table without one", async () => {
    const user = await loadSolution();
    await user.click(screen.getByRole("button", { name: /^Queue/ }));

    expect(await screen.findByText("This table does not support a command bar.")).toBeInTheDocument();
    expect(baseReads).not.toContain("queue");
  });

  it("hides a published button, counts the change, and shows it again", async () => {
    const user = await openAccount();
    const menu = await openMenu(user, "Delete");
    await user.click(within(menu).getByRole("menuitem", { name: "Hide" }));

    expect(within(treeItem("Mscrm.HomepageGrid.account.Delete")).getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Tables" })).getByText("Edited")).toBeInTheDocument();

    const again = await openMenu(user, "Delete");
    await user.click(within(again).getByRole("menuitem", { name: "Show again" }));
    expect(screen.queryByText("1 unsaved change")).not.toBeInTheDocument();
  });

  it("adds a button with a prefixed id and opens it in Details", async () => {
    const user = await openAccount();
    const menu = await openMenu(user, "Actions");
    await user.click(within(menu).getByRole("menuitem", { name: "Add button" }));

    expect(await screen.findByDisplayValue("new.account.Button1")).toBeInTheDocument();
    const label = screen.getByRole("textbox", { name: "Label" });
    expect(label).toHaveValue("New button");
    fireEvent.change(label, { target: { value: "Approve" } });
    expect(within(treeItem("new.account.Button1")).getByText("Approve")).toBeInTheDocument();
    expect(within(treeItem("new.account.Button1")).getByText("Custom")).toBeInTheDocument();
  });

  it("customises a published command and opens it in the Commands tab", async () => {
    const user = await openAccount();
    const menu = await openMenu(user, "New");
    await user.click(within(menu).getByRole("menuitem", { name: "Customise command" }));

    expect(await screen.findByRole("tab", { name: "Commands", selected: true })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Mscrm.NewRecordFromGrid")).toBeInTheDocument();
    expect(within(table).getByText("Customised")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mscrm.NewRecordFromGrid")).toBeInTheDocument();
  });

  it("marks a reference to a rule that is not defined", async () => {
    const user = await openAccount();
    selectTab("Commands");
    await user.click(await screen.findByText("new.account.Hello.Command"));

    const display = screen.getByRole("region", { name: "Display rules" });
    expect(within(display).getByText("new.account.IsOwner")).toBeInTheDocument();
    expect(within(display).queryByText("Not defined")).not.toBeInTheDocument();
    await user.selectOptions(within(display).getByRole("combobox"), "Mscrm.CanDeletePrimary");
    expect(within(display).getByText("Mscrm.CanDeletePrimary")).toBeInTheDocument();
  });

  it("validates the changed tables and opens Problems on errors", async () => {
    const sent: DiffsRequest[] = [];
    const problem: Problem = { severity: "error", table: "account", item: "new.account.Hello.Command", problem: "Display rule new_IsOwner is not defined." };
    httpServer.use(http.post(`${API}/validate`, async ({ request }) => {
      sent.push((await request.json()) as DiffsRequest);
      return HttpResponse.json({ problems: [problem] });
    }));
    const user = await openAccount();
    const menu = await openMenu(user, "Delete");
    await user.click(within(menu).getByRole("menuitem", { name: "Hide" }));
    await user.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByText("1 problem found.")).toBeInTheDocument();
    expect(Object.keys(sent[0]!.diffs)).toEqual(["account"]);
    expect(screen.getByRole("tab", { name: "Problems (1)", selected: true })).toBeInTheDocument();
    await user.click(screen.getByText("Display rule new_IsOwner is not defined."));
    expect(await screen.findByRole("tab", { name: "Commands", selected: true })).toBeInTheDocument();
    expect(screen.getByDisplayValue("new.account.Hello.Command")).toBeInTheDocument();
  });

  it("publishes after validation and confirmation, shows progress, and reloads", async () => {
    const published: PublishRequest[] = [];
    let polls = 0;
    httpServer.use(
      http.post(`${API}/validate`, () => HttpResponse.json({ problems: [] })),
      http.post(`${API}/publish`, async ({ request }) => {
        published.push((await request.json()) as PublishRequest);
        return HttpResponse.json({ jobId: "job-1" });
      }),
      http.get(`${API}/jobs/job-1`, () => {
        polls += 1;
        return HttpResponse.json(polls === 1 ? job({ status: "running", phase: "importing", progress: 40 }) : job());
      }),
    );
    const user = await openAccount();
    const menu = await openMenu(user, "Delete");
    await user.click(within(menu).getByRole("menuitem", { name: "Hide" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));

    const dialog = await screen.findByRole("dialog", { name: "Publish command bar changes" });
    expect(within(dialog).getByText(/re-imports the solution Ribbon edits/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(screen.getByLabelText("tool statuses")).toHaveTextContent("Publishing new_RibbonEdits: importing 40%"), { timeout: 3000 });
    expect(await screen.findByText("Published new_RibbonEdits.", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(published[0]!.baseHashes).toEqual({ account: "hash-account" });
    expect(Object.keys(published[0]!.diffs)).toEqual(["account"]);
    await waitFor(() => expect(loads).toEqual(["new_RibbonEdits", "new_RibbonEdits"]));
    await waitFor(() => expect(screen.queryByText("1 unsaved change")).not.toBeInTheDocument());
  });

  it("keeps the edits and offers Publish again when the import worked but publishing failed", async () => {
    const again: unknown[] = [];
    httpServer.use(
      http.post(`${API}/validate`, () => HttpResponse.json({ problems: [] })),
      http.post(`${API}/publish`, () => HttpResponse.json({ jobId: "job-2" })),
      http.get(`${API}/jobs/job-2`, () =>
        HttpResponse.json(job({ status: "publishFailed", message: "The changes were imported but not published, so users still see the old command bar.", errors: ["Publish blew up"] } satisfies Partial<PublishJob>)),
      ),
      http.post(`${API}/publish-again`, async ({ request }) => {
        again.push(await request.json());
        return HttpResponse.json({ status: "succeeded" });
      }),
    );
    const user = await openAccount();
    const menu = await openMenu(user, "Delete");
    await user.click(within(menu).getByRole("menuitem", { name: "Hide" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Publish" }));

    expect(await screen.findByText(/imported but not published/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Publish blew up")).toBeInTheDocument();
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish again" }));
    await waitFor(() => expect(again).toEqual([{ entities: ["account"], applicationRibbon: false }]));
  });

  it("shows import failure reasons and keeps the edits", async () => {
    httpServer.use(
      http.post(`${API}/validate`, () => HttpResponse.json({ problems: [] })),
      http.post(`${API}/publish`, () => HttpResponse.json({ jobId: "job-3" })),
      http.get(`${API}/jobs/job-3`, () => HttpResponse.json(job({ status: "failed", message: "The solution could not be imported.", errors: ["Account: Bad ribbon"] }))),
    );
    const user = await openAccount();
    const menu = await openMenu(user, "Delete");
    await user.click(within(menu).getByRole("menuitem", { name: "Hide" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("The solution could not be imported.", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText("Account: Bad ribbon")).toBeInTheDocument();
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();
  });

  it("asks before discarding changes and before switching solution", async () => {
    const user = await openAccount();
    const menu = await openMenu(user, "Delete");
    await user.click(within(menu).getByRole("menuitem", { name: "Hide" }));

    await user.selectOptions(screen.getByLabelText("Solution"), "new_Other");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Discard 1 unsaved change?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Solution")).toHaveValue("new_RibbonEdits");

    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("1 unsaved change")).not.toBeInTheDocument();
  });

  it("opens read-only when the user cannot publish", async () => {
    httpServer.use(...handlers(loadFixture({ canPublish: false, readOnlyReason: "You can look at command bars but not publish changes." })));
    const user = await openAccount();

    expect(screen.getAllByText("You can look at command bars but not publish changes.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    const menu = await openMenu(user, "Delete");
    expect(within(menu).getByRole("menuitem", { name: "Hide" })).toHaveAttribute("data-disabled");
  });

  it("warns about other components and shows a load error with Retry", async () => {
    let fail = true;
    httpServer.use(http.post(`${API}/load`, () => {
      if (fail) {
        fail = false;
        return HttpResponse.json({ code: "privilege_denied", message: "You do not have permission for this." }, { status: 403 });
      }
      return HttpResponse.json(loadFixture({ otherComponents: [{ type: 91, name: "Plug-in assembly", count: 1 }] }));
    }));
    const user = userEvent.setup();
    renderTool();
    const select = await screen.findByLabelText("Solution");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));
    await user.selectOptions(select, "new_RibbonEdits");
    await user.click(screen.getByRole("button", { name: "Load" }));

    expect(await screen.findByText("You do not have permission for this.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/also contains 1 plug-in assembly/)).toBeInTheDocument();
  });
});
