import type { EnvironmentVariable, SolutionOption } from "../model/types";

export const apiUrlId = "11111111-1111-1111-1111-111111111111";
export const retriesId = "22222222-2222-2222-2222-222222222222";
export const featureId = "33333333-3333-3333-3333-333333333333";
export const settingsId = "44444444-4444-4444-4444-444444444444";
export const passwordId = "55555555-5555-5555-5555-555555555555";
export const managedId = "66666666-6666-6666-6666-666666666666";

function variable(overrides: Partial<EnvironmentVariable> & Pick<EnvironmentVariable, "definitionId" | "schemaName">) {
  return {
    displayName: overrides.schemaName,
    description: null,
    type: 100000000,
    typeLabel: "Text",
    defaultValue: null,
    valueId: null,
    currentValue: null,
    secretStore: null,
    isManaged: false,
    isCustomizable: true,
    isActive: true,
    valueIsManaged: false,
    managedValueSolutions: [],
    conflictingValues: [],
    ...overrides,
  } satisfies EnvironmentVariable;
}

export function variablesFixture(): EnvironmentVariable[] {
  return [
    variable({
      definitionId: apiUrlId,
      schemaName: "contoso_ApiUrl",
      displayName: "API URL",
      defaultValue: "https://default.example.test",
      valueId: "aaaaaaaa-0000-0000-0000-000000000001",
      currentValue: "https://api.example.test",
    }),
    variable({
      definitionId: retriesId,
      schemaName: "contoso_Retries",
      displayName: "Retries",
      type: 100000001,
      typeLabel: "Number",
      defaultValue: "3",
    }),
    variable({
      definitionId: featureId,
      schemaName: "contoso_FeatureOn",
      displayName: "Feature On",
      type: 100000002,
      typeLabel: "Boolean",
      valueId: "aaaaaaaa-0000-0000-0000-000000000003",
      currentValue: "no",
    }),
    variable({
      definitionId: settingsId,
      schemaName: "contoso_Settings",
      displayName: "Settings",
      type: 100000003,
      typeLabel: "JSON",
      valueId: "aaaaaaaa-0000-0000-0000-000000000004",
      currentValue: '{\n  "mode": "fast"\n}',
    }),
    variable({
      definitionId: passwordId,
      schemaName: "contoso_Password",
      displayName: "Password",
      type: 100000005,
      typeLabel: "Secret",
      secretStore: 0,
    }),
    variable({
      definitionId: managedId,
      schemaName: "fabrikam_Region",
      displayName: "Region",
      isManaged: true,
      valueId: "aaaaaaaa-0000-0000-0000-000000000006",
      currentValue: "westeurope",
      valueIsManaged: true,
      managedValueSolutions: ["Fabrikam Core"],
    }),
  ];
}

export const solutionsFixture: SolutionOption[] = [
  { uniqueName: "ContosoCore", friendlyName: "Contoso Core", prefix: "contoso" },
];
