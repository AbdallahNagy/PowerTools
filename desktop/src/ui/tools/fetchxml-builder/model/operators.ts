import type { FieldType, Operator, RelativeCountOperator, RelativeDateOperator, UserOperator } from "./types";

export interface OperatorOption {
  value: Operator;
  label: string;
}

const USER_OPERATOR_OPTIONS: { value: UserOperator; label: string }[] = [
  { value: "eq-userid", label: "Equals current user" },
  { value: "ne-userid", label: "Does not equal current user" },
  { value: "eq-userteams", label: "Equals current user's teams" },
  { value: "eq-useroruserteams", label: "Equals current user or their teams" },
  { value: "eq-useroruserhierarchy", label: "Equals current user or reporting hierarchy" },
  { value: "eq-useroruserhierarchyandteams", label: "Equals current user, hierarchy, or teams" },
  { value: "eq-businessid", label: "Equals current business unit" },
  { value: "ne-businessid", label: "Does not equal current business unit" },
];

const RELATIVE_DATE_OPTIONS: { value: RelativeDateOperator; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this-week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "next-week", label: "Next week" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "next-month", label: "Next month" },
  { value: "this-year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "next-year", label: "Next year" },
  { value: "last-seven-days", label: "Last 7 days" },
  { value: "next-seven-days", label: "Next 7 days" },
  { value: "this-fiscal-year", label: "This fiscal year" },
  { value: "last-fiscal-year", label: "Last fiscal year" },
  { value: "next-fiscal-year", label: "Next fiscal year" },
  { value: "this-fiscal-period", label: "This fiscal period" },
  { value: "last-fiscal-period", label: "Last fiscal period" },
  { value: "next-fiscal-period", label: "Next fiscal period" },
];

const RELATIVE_COUNT_OPTIONS: { value: RelativeCountOperator; label: string }[] = [
  { value: "last-x-hours", label: "Last X hours" },
  { value: "next-x-hours", label: "Next X hours" },
  { value: "last-x-days", label: "Last X days" },
  { value: "next-x-days", label: "Next X days" },
  { value: "last-x-weeks", label: "Last X weeks" },
  { value: "next-x-weeks", label: "Next X weeks" },
  { value: "last-x-months", label: "Last X months" },
  { value: "next-x-months", label: "Next X months" },
  { value: "last-x-years", label: "Last X years" },
  { value: "next-x-years", label: "Next X years" },
  { value: "olderthan-x-days", label: "Older than X days" },
  { value: "olderthan-x-weeks", label: "Older than X weeks" },
  { value: "olderthan-x-months", label: "Older than X months" },
  { value: "olderthan-x-years", label: "Older than X years" },
];

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
  ...USER_OPERATOR_OPTIONS,
  ...RELATIVE_DATE_OPTIONS,
  ...RELATIVE_COUNT_OPTIONS,
];

const USER_OPERATORS = USER_OPERATOR_OPTIONS.map((option) => option.value);
const RELATIVE_DATE_OPERATORS = RELATIVE_DATE_OPTIONS.map((option) => option.value);
export const COUNT_VALUE_OPERATORS: Operator[] = RELATIVE_COUNT_OPTIONS.map((option) => option.value);

const OPERATORS_BY_TYPE: Record<FieldType, Operator[]> = {
  String: ["eq", "ne", "like", "not-like", "begins-with", "ends-with", "null", "not-null", "in", "not-in"],
  Memo: ["like", "not-like", "null", "not-null"],
  Integer: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null", "in", "not-in"],
  BigInt: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null"],
  Decimal: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null"],
  Double: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null"],
  Money: ["eq", "ne", "gt", "ge", "lt", "le", "null", "not-null"],
  DateTime: [
    "on", "on-or-before", "on-or-after", "gt", "ge", "lt", "le", "null", "not-null",
    ...RELATIVE_DATE_OPERATORS,
    ...COUNT_VALUE_OPERATORS,
  ],
  Boolean: ["eq", "ne", "null", "not-null"],
  Lookup: ["eq", "ne", "in", "not-in", "null", "not-null", ...USER_OPERATORS],
  Owner: ["eq", "ne", "in", "not-in", "null", "not-null", ...USER_OPERATORS],
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

export function isKnownOperator(value: string): value is Operator {
  return ALL_OPERATORS.some((option) => option.value === value);
}

export const NO_VALUE_OPERATORS: Operator[] = [
  "null",
  "not-null",
  ...USER_OPERATORS,
  ...RELATIVE_DATE_OPERATORS,
];
export const MULTI_VALUE_OPERATORS: Operator[] = ["in", "not-in"];
