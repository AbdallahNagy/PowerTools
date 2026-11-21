# Classic workflow fixtures

Input for Phase 5 (`process_apply`) in `desktop/docs/mcp-tool-architecture.md`. These are real classic workflows and actions from an unmanaged solution export of a Dataverse online org (version 9.2), anonymized. Nothing in the test project reads them yet.

- `Workflows/*.xaml` are the XAML files. The file name is the workflow name plus its `workflowid`.
- `customizations.xml` is the export's `customizations.xml` with only the `<Workflow>` entries for these files. It holds what the XAML does not: category, mode, triggers, scope, run-as, primary table and state.

## Anonymization

The XAML structure is exactly as exported. Only names and ids changed:

- Publisher prefixes became `contoso_`, `fab_` and `aw_`, and custom activity assemblies became `Contoso.*` and `Fabrikam.*`.
- Table, column, step and child workflow names were renamed to a neutral permit and license domain.
- Every GUID was replaced, consistently across all files, so workflow ids, `XrmWorkflow<id>` class names, file names and child workflow references still match. GUIDs that pointed at records (statuses, notification templates, configurations) now point at nothing.
- Arabic labels were replaced with `(ar)`.

Child workflows called from `ActionProvider-RenewalMainAction` and `WFLocalPermitClosure` are mostly not in this set; only `WFLocalPermitAutofinishBPF` is.

## The fixtures

Category 0 is a workflow and 3 is an action. Mode 1 is real-time and 0 is background. Every one has scope 4 (organization).

| File | Kind | Primary table | Trigger | What it shows |
|---|---|---|---|---|
| `LocalPermitSLAPermitOfficer` | workflow, real-time | `contoso_localpermitrequesttask` | on demand | The smallest case: one update of a related (parent) record through a lookup, setting a choice value. |
| `WFLocalPermitOnChangeProvider` | workflow, real-time | `contoso_localpermitrequest` | update of `contoso_accountversionid` | One condition (`NotNull`) and an update of a related record with a value read from another related record. |
| `WFLocalPermitAutofinishBPF` | workflow, background, child | `contoso_localpermitrequest` | on demand, as child | `SetState` (deactivate) inside a condition with the `In` operator. |
| `LocalPermitProviderFailureAction` | workflow, real-time | `contoso_localpermitrequesttask` | on demand | Calls a custom action (`InvokeSdkMessageActivity`) on a related record, and updates fields. |
| `ActionLocalPermitWarning1Applicant` | action | `contoso_localpermitrequest` | bound action | Action with an input argument, `RetrieveEntity`, and a custom workflow activity from an external assembly (notification step). |
| `ActionLocalPermitNotifyPayment` | action | `account` | bound action | Typed input arguments (`EntityReference`, `Double`), an update, and a custom activity. |
| `ActionLocalPermitAssignandnotifyProvider` | action | `contoso_localpermitrequest` | bound action | Create a related record with values copied from the primary record, the current time, condition branches, custom activity. |
| `ActionForeignPermitRequest-GovernmentEntity` | action | `contoso_foreignpermitrequest` | bound action | `SetState`, Stop workflow (`TerminateWorkflow` with succeeded and cancelled), nested `And` conditions, a custom activity with a JSON string input. |
| `ActionProvider-RenewalMainAction` | action | `contoso_licenseapplication` | bound action | A dispatcher: 14 `StartChildWorkflow` steps chosen by condition branches on a stage id string. |
| `WFLocalPermitOnCreate` | workflow, real-time | `contoso_localpermitrequest` | create | Create of a related record, values from a related `contact`, `Add` arithmetic, child workflow, four custom activities. |
| `WFLocalPermitClosure` | workflow, real-time | `contoso_localpermitrequest` | on demand | The large one (240 KB): deep nesting, `And`/`Or`, `In`, `SetState`, stop, child workflow, current time, many updates and custom activities. Use it as the round-trip and performance case. |

The export had 18 processes. The seven left out repeat patterns above: three large variants of `Closure`, a second dispatcher like `RenewalMainAction`, a second notification action, and two reminder actions like `ProviderFailureAction`.

## Step types in the whole export

| Step (designer name) | XAML element | Seen |
|---|---|---|
| Create record | `mxswa:CreateEntity` | 12 |
| Update record | `mxswa:UpdateEntity` | 30 |
| Change status | `mxswa:SetState` | 4 |
| Stop workflow | `TerminateWorkflow` inside a `StopWorkflowStep` sequence | 5 |
| Start child workflow | `mxswa:StartChildWorkflow` | 46 |
| Perform action | `mcwa:InvokeSdkMessageActivity` | 3 |
| Check condition / conditional branch | `ConditionSequence`, `ConditionBranch`, `EvaluateCondition`, `EvaluateLogicalCondition` | 73 branches |
| Custom workflow activity | `mxswa:ActivityReference` to a non-Microsoft type | 43 |

Building blocks inside the steps:

- Values: `EvaluateExpression` with `CreateCrmType` (literals of type OptionSetValue, String, EntityReference, Guid, Boolean, Integer), `SelectFirstNonNull` (the designer's dynamic value), `RetrieveCurrentTime` and `Add`.
- Reading: `mxswa:GetEntityProperty` on the primary record and on related records. Related records appear as `InputEntities("related_<lookup>#<table>")`, for example `related_contoso_applicantid#contact`. Actions use `mxswa:RetrieveEntity` for their `EntityReference` arguments.
- Writing: `mxswa:SetEntityProperty` on a temporary entity, then `CreateEntity` or `UpdateEntity`.
- Conditions: operators `Equal`, `NotEqual`, `NotNull`, `In`; logical `And`, `Or`.
- Action arguments: input only (`Target`, `StageId`, `OrganizationId`, `TotalAmount`). No output arguments.
- Custom activities: a notification step, BPF stage change, service configuration, close tasks, complete queue item, choice labels, entity reference primitives, paused task by assignee.

## Gaps

These are not in the export, so Phase 5 needs another source for them (a second export, or the Microsoft samples):

- Send email (the native `SendEmail` step). Every notification here goes through a custom activity.
- Assign record (`AssignEntity`). Assignment is done by custom activities.
- Wait conditions and timeouts (`Postpone`, `WaitCondition`), and any background workflow that waits.
- Delete-triggered workflows, and user, business unit or parent-child business unit scope (everything is organization scope).
- Action output arguments, and actions not bound to a table (global actions).
- Date operators in conditions (on or before, last X days) and `Contains`, `BeginsWith`.
- Dynamic values with a default when null, and the `Subtract`, `Multiply`, `Increment` operators.
- Workflows exported from an on-premises org. The doc asks for both; all of these come from online.
