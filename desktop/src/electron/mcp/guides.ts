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
classic workflow with process_apply (see powertools://guides/classic-workflows).

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

const CLASSIC_WORKFLOWS = `# Classic workflows and actions with process_apply

process_apply writes a classic workflow or a custom process action from typed steps. The XAML is the same the
classic designer writes, and it is saved by importing a small unmanaged solution that holds only the process, so it
works the same online and on-premises. The process then joins your solution, and the temporary solution is deleted.

## The spec

{
  "solution": "Core",
  "name": "Permit review",
  "kind": "workflow",
  "table": "new_permit",
  "mode": "realtime",
  "triggers": { "onCreate": true, "onUpdate": ["new_status"] },
  "runAs": "owner",
  "steps": [ ... ],
  "state": "activated"
}

- kind (workflow or action) and table cannot change once the process exists.
- Workflows: mode realtime (default) or background; triggers onDemand (default when triggers is left out), asChild,
  onCreate, onUpdate (columns; an empty list removes the update trigger); runAs owner or user (real-time only).
  The scope is always the organization.
- Actions: uniqueName is the message name with the publisher prefix (default prefix_NameWithoutSpaces) and cannot
  change; arguments are input arguments (string, integer, float, decimal, boolean, datetime, entityReference with
  table). Target is added for the table. Actions are always bound to table.
- steps replace all the steps. Leave steps out to change only properties or state.
- state activated (default) or draft. Changing an activated process saves it in draft and activates it again.

## Steps

Each step has an optional label (the text after the step in the designer) and exactly one of these:

{ "update": { "record": "new_applicantid", "values": { "new_status": 2 } } }   record: primary (default) or a lookup on it
{ "create": { "table": "task", "values": { "subject": "Call", "regardingobjectid": { "column": "new_permitid" } } } }
{ "sendEmail": { "from": <user>, "to": [<party>, ...], "cc": [...], "subject": "Hi", "body": { "column": "new_name" },
                 "regarding": <default the primary record>, "values": { "prioritycode": 1 } } }
{ "assign": { "record": "primary", "owner": { "lookup": { "table": "team", "id": "<guid>", "name": "Reviewers" } } } }
{ "setState": { "record": "primary", "state": 1, "status": 2 } }
{ "if": { "condition": <condition>, "then": [steps], "elseIf": [{ "condition": ..., "then": [...] }], "else": [steps] } }
{ "childWorkflow": "Close tasks" }        a workflow on the same table that allows running as a child
{ "action": { "name": "new_NotifyApplicant", "record": "primary" } }   an activated action bound to that record's table
{ "customActivity": { "type": "Contoso.Steps.CloseTasks", "inputs": [{ "name": "Reason", "type": "string", "value": "Done" }] } }
{ "stop": { "status": "succeeded", "message": "Nothing to do" } }
{ "keep": "CustomActivityStep3" }         a step read back that Power Tools cannot write, kept as it is

## Values

- A literal: text "Hello", a choice number 2, a yes/no true, or a lookup { "lookup": { "table", "id", "name" } }.
- A column of the primary record or a record a lookup points to: { "column": "emailaddress1", "from": "new_applicantid",
  "default": "none" }. default (a literal) is used when the column is empty.
- An action's input argument: { "argument": "Reason" }.
- The current time: { "now": true } (date columns).
- Text joined from parts: { "concat": ["Permit ", { "column": "new_name" }] }.

Literal numbers, dates and money are not written yet: copy them from a column instead.

## Conditions

{ "column": "new_status", "from": "new_applicantid", "operator": "equals", "value": 2 }
Operators: equals, notEquals, null, notNull, in (with values). Actions can test { "argument": "StageId", ... }.
Combine with { "all": [conditions] } (and) or { "any": [conditions] } (or), nested as needed.

## Reading a process

inspect_solution kind process with a name returns the process in this shape (child workflows by name). Change it and
send it back with solution added. Steps Power Tools cannot express come back as { "keep": id, "summary": ... }: leave
them where they are (or remove them) and they are saved exactly as they were. A process with output arguments cannot
be written back.

## Not written yet

Wait conditions and timeouts, delete triggers, user or business unit scope, action output arguments, global (unbound)
actions, date and text-search condition operators (on or after, contains, begins with), custom step outputs (kept as
they are), and literal number, date or money values. Build those in the classic designer.
`;

export const MCP_GUIDES: readonly McpGuide[] = [
  {
    uri: "powertools://guides/cloud-flows",
    name: "cloud-flows",
    title: "Cloud flows",
    description: "How to write a flow_apply spec: definition, connection references, connections and turning a flow on.",
    text: CLOUD_FLOWS,
  },
  {
    uri: "powertools://guides/classic-workflows",
    name: "classic-workflows",
    title: "Classic workflows and actions",
    description: "How to write a process_apply spec: kinds, triggers, steps, values, conditions and reading a process back.",
    text: CLASSIC_WORKFLOWS,
  },
];

export function findGuide(uri: string): McpGuide | undefined {
  return MCP_GUIDES.find((g) => g.uri === uri);
}
