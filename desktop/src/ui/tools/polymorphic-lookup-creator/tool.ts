import { defineTool } from "../defineTool";
import PolymorphicLookupIcon from "./polymorphic-lookup-icon.svg";
import PolymorphicLookupCreator from "./PolymorphicLookupCreator";

export const polymorphicLookupTool = defineTool({
  id: "polymorphic-lookup-creator",
  title: "Polymorphic Lookup Creator",
  tooltip: "Create, update, and delete polymorphic lookups for the selected environment",
  icon: PolymorphicLookupIcon,
  showInActivityBar: true,
  component: PolymorphicLookupCreator,
  allowMultipleInstances: false,
});
