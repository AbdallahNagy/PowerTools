# Plugin Registration

Activity-bar tool for browsing and managing Dataverse plug-in assemblies, types, steps, and images for one connection.

## Folder map

- `tool.ts` — activity-bar manifest
- `PluginRegistration.tsx` — layout, context menu, dialogs
- `model/` — contracts, catalog tree, forms, node actions
- `api/` — react-query hooks (`meta.connectionName`; mutations set `noAuthRetry`)
- `components/` — tree, details, dialogs
- Sidecar: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/`

## Validation

Server validators in sidecar `Validation/` (`StepDraftValidator`, `ImageDraftValidator`, `AssemblyDraftValidator`) are authoritative. The UI renders `problems` by field and does not bypass those rules.

## Adding an action

1. Add a `NodeActionId` in `model/nodeActions.ts`.
2. Handle it in `PluginRegistration.tsx` `runAction`.
3. Add a sidecar endpoint and service method.
4. Call it from `api/use*.ts`. Mutations must send `noAuthRetry: true`.

Inspired by XrmToolBox Plugin Registration (https://github.com/imranakram/PluginRegistration). Domain rules only; no plugin source was copied.
