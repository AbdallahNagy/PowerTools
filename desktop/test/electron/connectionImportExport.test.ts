import { describe, expect, it, vi } from "vitest";

import {
  classifyImport,
  commitImport,
  exportConnections,
  parseImportFile,
} from "../../src/electron/connectionImportExport";
import { createConnectionStore } from "../../src/electron/connectionStore";

const XRMTOOLBOX_FILE = `<?xml version="1.0" encoding="utf-8"?>
<CrmConnections xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Connections>
    <ConnectionDetail>
      <ConnectionId>3f1c0d2e-0000-0000-0000-000000000001</ConnectionId>
      <ConnectionName>Contoso UAT</ConnectionName>
      <NewAuthType>OAuth</NewAuthType>
      <OrganizationFriendlyName>Contoso</OrganizationFriendlyName>
      <OriginalUrl>https://contoso-uat.crm4.dynamics.com/</OriginalUrl>
      <OrganizationServiceUrl>https://contoso-uat.api.crm4.dynamics.com/XRMServices/2011/Organization.svc</OrganizationServiceUrl>
      <UserName>jo@contoso.com</UserName>
      <EnvironmentHighlightingInfo>
        <Color>Red</Color>
        <Text>UAT</Text>
      </EnvironmentHighlightingInfo>
      <BrowserName>Edge</BrowserName>
      <BrowserProfile>Profile 1</BrowserProfile>
      <UserPassword>encrypted-by-xrmtoolbox</UserPassword>
    </ConnectionDetail>
    <ConnectionDetail>
      <ConnectionName>Fabrikam &amp; Co on-prem</ConnectionName>
      <NewAuthType>IFD</NewAuthType>
      <UseIfd>true</UseIfd>
      <OriginalUrl>https://crm.fabrikam.local/fabrikam</OriginalUrl>
      <UserName>jo</UserName>
      <UserDomain>FAB</UserDomain>
      <BrowserName>None</BrowserName>
    </ConnectionDetail>
    <ConnectionDetail>
      <ConnectionName>Automation app</ConnectionName>
      <NewAuthType>ClientSecret</NewAuthType>
      <OriginalUrl>https://contoso.crm4.dynamics.com</OriginalUrl>
      <OrganizationFriendlyName>Contoso</OrganizationFriendlyName>
    </ConnectionDetail>
  </Connections>
</CrmConnections>`;

function emptyStore() {
  let next = 0;
  return createConnectionStore({ initial: { connections: [] }, save: vi.fn(), createId: () => `new-${++next}` });
}

describe("XrmToolBox import", () => {
  it("reads organization, environment, browser and sign-in type", () => {
    const { source, entries } = parseImportFile(XRMTOOLBOX_FILE);
    expect(source).toBe("xrmtoolbox");
    expect(entries.map(({ key, organization, environment, legacyName, envUrl, crmType, authMode, username, domain, browser, status }) => ({
      key, organization, environment, legacyName, envUrl, crmType, authMode, username, domain, browser, status,
    }))).toEqual([
      {
        key: "x0",
        organization: "Contoso",
        environment: "UAT",
        legacyName: "Contoso UAT",
        envUrl: "https://contoso-uat.crm4.dynamics.com",
        crmType: "online",
        authMode: "ad",
        username: "jo@contoso.com",
        domain: "",
        browser: { id: "edge", profile: "Profile 1" },
        status: "new",
      },
      {
        key: "x1",
        organization: null,
        environment: null,
        legacyName: "Fabrikam & Co on-prem",
        envUrl: "https://crm.fabrikam.local/fabrikam",
        crmType: "onpremise",
        authMode: "ifd",
        username: "jo",
        domain: "FAB",
        browser: null,
        status: "new",
      },
      {
        key: "x2",
        organization: "Contoso",
        environment: null,
        legacyName: "Automation app",
        envUrl: "https://contoso.crm4.dynamics.com",
        crmType: "online",
        authMode: "ad",
        username: "",
        domain: "",
        browser: null,
        status: "unsupported",
      },
    ]);
  });

  it("reads one exported ConnectionDetail", () => {
    const single = `<ConnectionDetail><ConnectionName>Solo</ConnectionName><OriginalUrl>https://solo.crm.dynamics.com</OriginalUrl></ConnectionDetail>`;
    expect(parseImportFile(single).entries).toHaveLength(1);
  });

  it("rejects files it cannot read", () => {
    expect(() => parseImportFile("hello")).toThrow("Choose a Power Tools export");
    expect(() => parseImportFile("{ nope")).toThrow("not valid JSON");
    expect(() => parseImportFile('{"connections": []}')).toThrow("not a Power Tools connections export");
    expect(() => parseImportFile("<Something/>")).toThrow("no XrmToolBox connections");
  });

  it("imports chosen connections, never their passwords, and puts unnamed ones under Other", () => {
    const store = emptyStore();
    const entries = classifyImport(parseImportFile(XRMTOOLBOX_FILE).entries, store.list());
    expect(entries.map((entry) => entry.status)).toEqual(["new", "ungrouped", "unsupported"]);

    expect(commitImport(store, entries, ["x0", "x1", "x2"])).toBe(2);
    const [uat, fabrikam] = store.list();
    expect(uat).toMatchObject({ organization: "Contoso", environment: "UAT", browser: { id: "edge", profile: "Profile 1" }, account: null });
    expect(fabrikam).toMatchObject({ legacyName: "Fabrikam & Co on-prem", encryptedPassword: "", needsPassword: true });
    expect(JSON.stringify(store.list())).not.toContain("encrypted-by-xrmtoolbox");
    expect(store.activeId).toBe(uat.id);
  });

  it("skips environments already added and sends name clashes under Other", () => {
    const store = emptyStore();
    store.add({ envUrl: "https://contoso-uat.crm4.dynamics.com/", crmType: "online", homeAccountId: null, account: null, organization: "Other org", environment: "Dev", browser: null });
    store.add({ envUrl: "https://elsewhere.crm.dynamics.com", crmType: "online", homeAccountId: null, account: null, organization: "contoso", environment: "uat", browser: null });

    const xml = XRMTOOLBOX_FILE.replace("https://crm.fabrikam.local/fabrikam", "https://contoso-uat2.crm4.dynamics.com")
      .replace("<ConnectionName>Fabrikam &amp; Co on-prem</ConnectionName>", "<ConnectionName>Contoso UAT 2</ConnectionName><OrganizationFriendlyName>Contoso</OrganizationFriendlyName><EnvironmentHighlightingInfo><Text>UAT</Text></EnvironmentHighlightingInfo>");
    const entries = classifyImport(parseImportFile(xml).entries, store.list());

    expect(entries.map((entry) => entry.status)).toEqual(["duplicate", "ungrouped", "unsupported"]);
    commitImport(store, entries, ["x0", "x1"]);
    expect(store.list()[store.list().length - 1]).toMatchObject({ organization: "Contoso", environment: null, legacyName: "Contoso UAT 2" });
  });
});

describe("Power Tools export", () => {
  it("round-trips without secrets and keeps ids so a re-import is a duplicate", () => {
    const store = emptyStore();
    store.add({ envUrl: "https://contoso.crm.dynamics.com", crmType: "online", homeAccountId: "home-1", account: null, organization: "Contoso", environment: "Production", browser: { id: "chrome", profile: "Default" } });
    store.add({ envUrl: "https://crm.local/org", crmType: "onpremise", authMode: "ad", username: "jo", domain: "LOCAL", encryptedPassword: "secret-blob", organization: "Local", environment: "Dev", browser: null });

    const file = exportConnections(store.list());
    expect(file).not.toContain("secret-blob");
    expect(file).not.toContain("home-1");

    const parsed = parseImportFile(file);
    expect(parsed.source).toBe("powertools");
    expect(classifyImport(parsed.entries, store.list()).map((entry) => entry.status)).toEqual(["duplicate", "duplicate"]);

    const fresh = emptyStore();
    expect(commitImport(fresh, classifyImport(parsed.entries, fresh.list()), ["p0", "p1"])).toBe(2);
    expect(fresh.list().map((conn) => conn.id)).toEqual(store.list().map((conn) => conn.id));
    expect(fresh.get(store.list()[1].id)).toMatchObject({ needsPassword: true, username: "jo", domain: "LOCAL" });
  });
});
