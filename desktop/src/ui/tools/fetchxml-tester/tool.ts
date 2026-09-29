import { defineTool } from "../defineTool";
import FetchXmlTesterIcon from "./fetchxml-tester-icon.svg";
import FetchXmlTester from "./index";

export const fetchXmlTesterTool = defineTool({
  id: "fetchxml-tester",
  title: "FetchXML Tester",
  tooltip: "Run FetchXML as written and keep a query library",
  icon: FetchXmlTesterIcon,
  showInActivityBar: true,
  component: FetchXmlTester,
  allowMultipleInstances: true,
});
