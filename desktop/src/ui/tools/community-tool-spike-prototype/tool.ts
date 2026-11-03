// PROTOTYPE (issue #101). Throwaway: never merge to main.
import { defineTool } from "../defineTool";
import CommunityToolSpike from "./CommunityToolSpike";
import TranslatorIcon from "../translator/translator-icon.svg";

export const communityToolSpikeTool = defineTool({
  id: "community-tool-spike-prototype",
  title: "Community tool spike (prototype)",
  tooltip: "PROTOTYPE: a sandboxed community tool tab that sends a Dataverse request",
  icon: TranslatorIcon,
  showInActivityBar: true,
  component: CommunityToolSpike,
});
