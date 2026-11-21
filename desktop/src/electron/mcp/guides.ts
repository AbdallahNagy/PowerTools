/**
 * Guides the MCP server offers as resources. Tool descriptions stay short and link here for the detail an
 * agent needs only when it uses that tool.
 */
export interface McpGuide {
  uri: string;
  name: string;
  title: string;
  description: string;
  text: string;
}

const CLOUD_FLOWS = `# Cloud flows with flow_apply

Cloud flows exist only online (Power Automate). On-premises flow_apply answers NotSupported: build the logic as a
classic workflow in a development environment and import its solution with solution_import.

## The spec

{
  "solution": "Core",
  "name": "New account follow-up",
  "connectionReferences": {
    "shared_commondataserviceforapps": { "logicalName": "new_dataverse", "connector": "shared_commondataserviceforapps" }
  },
  "definition": { "triggers": { ... }, "actions": { ... } },
  "state": "on"
}

- definition is the Logic Apps workflow definition: triggers and actions. Power Tools adds $schema, contentVersion
  and the $connections and $authentication parameters when they are missing.
- Every action or trigger that calls a connector names it in inputs.host.connectionName. Each connectionName needs
  a key in connectionReferences with the same name. A missing key is refused before anything is written.
- A connection reference that does not exist is created in the solution. One that exists must use the same connector.
- Leave definition out to keep the flow's definition (for example, to only turn it on or off).
- state on turns the flow on; off turns it off. Left out, a new flow is off and an existing flow keeps its state.
- Changing a flow that is on turns it off, saves it, and turns it on again.

## Connections

An agent cannot create connections: they need the user to sign in. While a connection reference has no connection
the flow stays off, and the result names each reference and its connector. Ask the user to open the maker portal
(make.powerautomate.com > Connections), sign in to that connector, and set the connection on the reference. Then send
the same spec again to turn the flow on.

## Dataverse trigger and action

Trigger when a row is added (message 1 create, 2 delete, 3 update, 4 create or update; scope 4 is the organization):

"When_an_account_is_added": {
  "type": "OpenApiConnectionWebhook",
  "inputs": {
    "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "SubscribeWebhookTrigger",
              "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
    "parameters": { "subscriptionRequest/message": 1, "subscriptionRequest/entityname": "account", "subscriptionRequest/scope": 4 },
    "authentication": "@parameters('$authentication')"
  }
}

Add a row (entityName is the entity set name, item/<column> sets columns; @triggerOutputs()?['body/accountid'] reads
the trigger row):

"Add_a_task": {
  "type": "OpenApiConnection",
  "runAfter": {},
  "inputs": {
    "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
              "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
    "parameters": { "entityName": "tasks", "item/subject": "Call @{triggerOutputs()?['body/name']}",
                    "item/regardingobjectid_account_task@odata.bind": "/accounts(@{triggerOutputs()?['body/accountid']})" },
    "authentication": "@parameters('$authentication')"
  }
}

Other Dataverse operationIds: UpdateRecord (entityName, recordId, item/...), GetItem (entityName, recordId),
ListRecords (entityName, $filter, $select, $top), DeleteRecord (entityName, recordId).
A recurrence trigger needs no connection: { "type": "Recurrence", "recurrence": { "frequency": "Day", "interval": 1 } }.

## Reading a flow

inspect_solution kind flow with a name returns the flow in this same shape (name, state, connectionReferences,
definition), so an agent can change it and send it back to flow_apply.
`;

export const MCP_GUIDES: readonly McpGuide[] = [
  {
    uri: "powertools://guides/cloud-flows",
    name: "cloud-flows",
    title: "Cloud flows",
    description: "How to write a flow_apply spec: definition, connection references, connections and turning a flow on.",
    text: CLOUD_FLOWS,
  },
];

export function findGuide(uri: string): McpGuide | undefined {
  return MCP_GUIDES.find((g) => g.uri === uri);
}
