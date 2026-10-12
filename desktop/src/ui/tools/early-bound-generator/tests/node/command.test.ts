import { describe, expect, it } from "vitest";
import { buildPacCommand, quoteArgument } from "../../model/command";
import { DEFAULT_SETTINGS, expandTables, toGenerationRequest } from "../../model/settings";

describe("buildPacCommand", () => {
  it("builds the pac command for the default settings", () => {
    const request = toGenerationRequest("C:\\src\\Model", DEFAULT_SETTINGS, expandTables("", null));
    expect(buildPacCommand(request)).toBe(
      "pac modelbuilder build --outdirectory C:\\src\\Model --namespace DataverseModel --serviceContextName DataverseContext" +
        " --entitytypesfolder Entities --optionsetstypesfolder OptionSets --messagestypesfolder Messages" +
        " --emitvirtualattributes --suppressGeneratedCodeAttribute --writesettingsTemplateFile",
    );
  });

  it("quotes paths with spaces and always quotes filters", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      serviceContextName: "",
      tablesText: "account\ncontact",
      generateMessages: true,
      messagesText: "new_*",
      generateGlobalOptionSets: true,
      emitFieldsClasses: true,
      emitVirtualAttributes: false,
      emitEntityETC: true,
      suppressINotifyPattern: true,
      suppressGeneratedCodeAttribute: false,
    };
    const request = toGenerationRequest("C:\\Users\\Dev\\My Model", settings, expandTables(settings.tablesText, null));
    expect(buildPacCommand(request)).toBe(
      'pac modelbuilder build --outdirectory "C:\\Users\\Dev\\My Model" --namespace DataverseModel' +
        " --entitytypesfolder Entities --optionsetstypesfolder OptionSets --messagestypesfolder Messages" +
        ' --entitynamesfilter "account;contact" --generatesdkmessages --messagenamesfilter "new_*"' +
        " --generateGlobalOptionSets --emitfieldsclasses --emitentityetc --suppressINotifyPattern --writesettingsTemplateFile",
    );
  });

  it("shows a placeholder until a folder is chosen", () => {
    const request = toGenerationRequest("", DEFAULT_SETTINGS, expandTables("", null));
    expect(buildPacCommand(request)).toContain('--outdirectory "<output folder>"');
  });

  it("escapes double quotes", () => {
    expect(quoteArgument('a "b"')).toBe('"a \\"b\\""');
    expect(quoteArgument("plain")).toBe("plain");
  });
});
