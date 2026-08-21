import type { FieldType, Operator } from "./types";

export interface OperatorOption {
  value: Operator;
  label: string;
}

export const ALL_OPERATORS: OperatorOption[] = [
  { value: "eq", label: "Equals" },
  { value: "ne", label: "Does not equal" },
  { value: "like", label: "Contains" },
  { value: "not-like", label: "Does not contain" },
  { value: "begins-with", label: "Begins with" },
  { value: "ends-with", label: "Ends with" },
  { value: "gt", label: "Greater than" },
  { value: "ge", label: "Greater than or equal" },
  { value: "lt", label: "Less than" },
  { value: "le", label: "Less than or equal" },
  { value: "null", label: "Does not contain data" },
  { value: "not-null", label: "Contains data" },
  { value: "in", label: "In" },
  { value: "not-in", label: "Not in" },
  { value: "on", label: "On" },
  { value: "on-or-before", label: "On or before" },
  { value: "on-or-after", label: "On or after" },
];

const OPERATORS_BY_TYPE: Record<FieldType, Operator[]> = {
  String: ["eq", "ne", "like", "not-like", "begins-with", "ends-with", "null", "not-null", "in", "not-in"],
  Memo: ["like", "not-like", "null", "not-null"],
  Integer: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null", "in", "not-in"],
  BigInt: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null"],
  Decimal: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null"],
  Double: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null"],
  Money: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null"],
  DateTime: ["on", "on-or-before", "on-or-after", "gt", "ge", "lt", "le", "null", "not-null"],
  Boolean: ["eq", "ne", "null", "not-null"],
  Lookup: ["eq", "ne", "in", "not-in", "null", "not-null"],
  Owner: ["eq", "ne", "in", "not-in", "null", "not-null"],
  Customer: ["eq", "ne", "in", "not-in", "null", "not-null"],
  Picklist: ["eq", "ne", "in", "not-in", "null", "not-null"],
  State: ["eq", "ne", "in", "not-in"],
  Status: ["eq", "ne", "in", "not-in"],
  Uniqueidentifier: ["eq", "ne", "in", "not-in", "null", "not-null"],
  Virtual: ["null", "not-null"],
  Unknown: ["eq", "ne", "null", "not-null"],
};

export function getOperatorsForType(type: FieldType): OperatorOption[] {
  const allowed = OPERATORS_BY_TYPE[type] ?? OPERATORS_BY_TYPE.Unknown;
  return ALL_OPERATORS.filter((o) => allowed.includes(o.value));
}

export const NO_VALUE_OPERATORS: Operator[] = ["null", "not-null"];
export const MULTI_VALUE_OPERATORS: Operator[] = ["in", "not-in"];
