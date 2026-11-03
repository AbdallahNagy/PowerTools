// PROTOTYPE (issue #101). Throwaway driver for the community tool spike.
// Uses the real dev profile so the tab has a signed-in connection.
import { _electron as electron, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const desktopDir = fileURLToPath(new URL("../..", import.meta.url));
const out = process.env.SPIKE_OUT ?? ".";

test("community tool spike", async () => {
  const app = await electron.launch({
    args: ["--host-resolver-rules=MAP localhost 127.0.0.1", "."],
    cwd: desktopDir,
    env: { ...process.env, NODE_ENV: "development", SENTRY_DSN: "" },
  });
  app.process().stdout?.on("data", (d) => { const s = String(d); if (s.includes("prototype-tool")) console.log("MAIN", s.trim()); });
  try {
    let win = app.windows().find((w) => w.url().startsWith("http://localhost:5123"));
    while (!win) { await new Promise((r) => setTimeout(r, 500)); win = app.windows().find((w) => w.url().startsWith("http://localhost:5123")); }
    win.on("console", (m) => { if (m.text().includes("hello-tool")) console.log("FRAME", m.text()); });
    await win.waitForLoadState("domcontentloaded");
    await win.getByRole("button", { name: /PROTOTYPE: a sandboxed community tool/ }).click({ timeout: 60_000 });
    await win.waitForTimeout(8000);
    const dump = async (label: string) => {
      const frame = win!.frames().find((f) => f.url().startsWith("pt-tool://"));
      const results = frame ? await frame.evaluate(() => (window as any).__results) : "no frame";
      const shellText = await win!.locator("table.text-xs").innerText().catch(() => "");
      console.log(`=== ${label}\nPROCESSES\n${shellText}\nRESULTS ${JSON.stringify(results, null, 1)}`);
      await win!.screenshot({ path: `${out}/spike-${label}.png` });
    };
    await win.getByRole("button", { name: "Refresh processes" }).click();
    await win.waitForTimeout(500);
    await dump("opaque");
    await win.getByLabel("allow-same-origin").check();
    await win.waitForTimeout(8000);
    await win.getByRole("button", { name: "Refresh processes" }).click();
    await win.waitForTimeout(500);
    await dump("same-origin");
    await win.getByRole("button", { name: "Open shell dialog over tool" }).click();
    await win.waitForTimeout(800);
    await win.screenshot({ path: `${out}/spike-dialog.png` });
  } finally {
    await app.close();
  }
});
