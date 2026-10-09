import { defineTool } from "../defineTool";
import Translator from "./Translator";
import TranslatorIcon from "./translator-icon.svg";

export const translatorTool = defineTool({
  id: "translator",
  title: "Translator",
  tooltip: "Edit table, column, choice, view, and chart labels in every installed language",
  icon: TranslatorIcon,
  showInActivityBar: true,
  component: Translator,
  allowMultipleInstances: true,
});
