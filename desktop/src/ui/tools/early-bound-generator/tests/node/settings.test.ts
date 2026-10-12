import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  FOLDER_ERROR,
  NAMESPACE_ERROR,
  applyLoadedSettings,
  expandTables,
  hasErrors,
  isSafeRelativeFolder,
  parseLines,
  parseMessages,
  toGenerationRequest,
  validateSettings,
} from "../../model/settings";
import type { FormSettings } from "../../model/types";
import { tableNamesFixture } from "../fixtures";

const known = tableNamesFixture.tables;

function settings(overrides: Partial<FormSettings> = {}): FormSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("parseLines", () => {
  it("splits on lines, commas, and semicolons and drops blanks", () => {
    expect(parseLines(" account \n\ncontact;new_*, systemuser\r\n")).toEqual(["account", "contact", "new_*", "systemuser"]);
  });
});

describe("expandTables", () => {
  it("expands * and % against the environment's tables in name order, without duplicates", () => {
    const result = expandTables("contact\nnew_project*\nNEW_%contact\ncontact", known);
    expect(result.names).toEqual(["contact", "new_project", "new_project_contact", "new_projecttask"]);
    expect(result.unknown).toEqual([]);
    expect(result.emptyPatterns).toEqual([]);
    expect(result.hasPatterns).toBe(true);
  });

  it("lowercases names and reports names the environment does not have", () => {
    const result = expandTables("Account\nnew_missing", known);
    expect(result.names).toEqual(["account", "new_missing"]);
    expect(result.unknown).toEqual(["new_missing"]);
  });

  it("reports patterns that match nothing, so an empty expansion never means every table", () => {
    const result = expandTables("zzz_*", known);
    expect(result.names).toEqual([]);
    expect(result.emptyPatterns).toEqual(["zzz_*"]);
    expect(validateSettings(settings({ tablesText: "zzz_*" }), result).tables).toBe("No table matches: zzz_*.");
  });

  it("treats regular expression characters in names literally", () => {
    expect(expandTables("acc.unt", known).invalid).toEqual(["acc.unt"]);
    expect(expandTables("new_project*", ["new_projectx", "new_project.x"]).names).toEqual(["new_project.x", "new_projectx"]);
  });

  it("keeps patterns unexpanded and skips the name check without a table list", () => {
    const result = expandTables("account\nnew_*", null);
    expect(result.names).toEqual(["account", "new_*"]);
    expect(result.unknown).toEqual([]);
  });
});

describe("parseMessages", () => {
  it("keeps case, writes % as *, and rejects characters that could break the engine's FetchXML", () => {
    expect(parseMessages("new_DoThing\nnew_%\nNEW_DOTHING\nnew_'x\nmsdyn_<a>")).toEqual({
      names: ["new_DoThing", "new_*"],
      invalid: ["new_'x", "msdyn_<a>"],
    });
  });
});

describe("validateSettings", () => {
  it("accepts the defaults", () => {
    expect(hasErrors(validateSettings(DEFAULT_SETTINGS, expandTables("", known)))).toBe(false);
  });

  it.each(["", "1Model", "Contoso..Model", "Contoso Model", "Contoso.Model."])("rejects the namespace %j", (namespace) => {
    expect(validateSettings(settings({ namespace }), expandTables("", known)).namespace).toBe(NAMESPACE_ERROR);
  });

  it("requires the namespace and service context name to differ", () => {
    expect(
      validateSettings(settings({ namespace: "Model", serviceContextName: "Model" }), expandTables("", known)).serviceContextName,
    ).toBe("The service context name must differ from the namespace.");
  });

  it("allows an empty service context name unless messages are on", () => {
    const tables = expandTables("", known);
    expect(validateSettings(settings({ serviceContextName: "" }), tables).serviceContextName).toBeUndefined();
    expect(validateSettings(settings({ serviceContextName: "", generateMessages: true }), tables).serviceContextName).toBe(
      "Message classes need the service context. Enter a service context name.",
    );
  });

  it.each(["../Entities", "/Entities", "C:\\Entities", "", "Model/../..", "a*b"])("rejects the folder %j", (folder) => {
    expect(validateSettings(settings({ entityTypesFolder: folder }), expandTables("", known)).entityTypesFolder).toBe(FOLDER_ERROR);
  });

  it("allows nested relative folders", () => {
    expect(isSafeRelativeFolder("Model/Entities")).toBe(true);
    expect(isSafeRelativeFolder("Model\\Entities\\")).toBe(true);
  });

  it("reports unknown tables and invalid message names", () => {
    const errors = validateSettings(
      settings({ tablesText: "account\nnew_gone", generateMessages: true, messagesText: "new_'x" }),
      expandTables("account\nnew_gone", known),
    );
    expect(errors.tables).toBe("Not found in this environment: new_gone.");
    expect(errors.messages).toBe("Use only letters, digits, underscores, and * or %: new_'x.");
  });

  it("ignores the message list while messages are off", () => {
    expect(validateSettings(settings({ messagesText: "new_'x" }), expandTables("", known)).messages).toBeUndefined();
  });
});

describe("toGenerationRequest", () => {
  it("sends expanded table names and clears messages when they are off", () => {
    const form = settings({ tablesText: "new_project*", messagesText: "new_*" });
    const request = toGenerationRequest("C:\\src\\Model", form, expandTables(form.tablesText, known));
    expect(request.entityNamesFilter).toEqual(["new_project", "new_project_contact", "new_projecttask"]);
    expect(request.generateMessages).toBe(false);
    expect(request.messageNamesFilter).toEqual([]);
    expect(request.outputDirectory).toBe("C:\\src\\Model");
  });

  it("sends the message filter when messages are on", () => {
    const form = settings({ generateMessages: true, messagesText: "new_%\nWhoAmI" });
    expect(toGenerationRequest("/out", form, expandTables("", known)).messageNamesFilter).toEqual(["new_*", "WhoAmI"]);
  });
});

describe("applyLoadedSettings", () => {
  it("takes values from builderSettings.json and keeps the form's value for missing keys", () => {
    const loaded = applyLoadedSettings(settings({ emitEntityETC: true }), {
      namespace: "Contoso.Model",
      serviceContextName: "Ctx",
      entityTypesFolder: "Tables",
      optionSetsTypesFolder: null,
      messagesTypesFolder: null,
      entityNamesFilter: ["account", "contact"],
      messageNamesFilter: null,
      generateSdkMessages: true,
      generateGlobalOptionSets: null,
      emitFieldsClasses: true,
      emitVirtualAttributes: false,
      emitEntityETC: null,
      suppressINotifyPattern: null,
      suppressGeneratedCodeAttribute: false,
    });

    expect(loaded).toEqual({
      ...DEFAULT_SETTINGS,
      namespace: "Contoso.Model",
      serviceContextName: "Ctx",
      entityTypesFolder: "Tables",
      tablesText: "account\ncontact",
      generateMessages: true,
      emitFieldsClasses: true,
      emitVirtualAttributes: false,
      emitEntityETC: true,
      suppressGeneratedCodeAttribute: false,
    });
  });
});
