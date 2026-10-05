import type {
  AttributeInfo,
  TableAttributesResponse,
  TableInfo,
  TablesResponse,
} from "../model/types";

export function table(overrides: Partial<TableInfo> & Pick<TableInfo, "logicalName">): TableInfo {
  return {
    schemaName: overrides.logicalName,
    displayName: null,
    entitySetName: `${overrides.logicalName}s`,
    objectTypeCode: null,
    primaryIdAttribute: `${overrides.logicalName}id`,
    primaryNameAttribute: "name",
    isCustom: false,
    isManaged: false,
    isIntersect: false,
    isActivity: false,
    ownershipType: "UserOwned",
    ...overrides,
  };
}

export function attribute(
  overrides: Partial<AttributeInfo> & Pick<AttributeInfo, "logicalName">,
): AttributeInfo {
  return {
    schemaName: overrides.logicalName,
    displayName: null,
    description: null,
    attributeType: "String",
    attributeTypeName: "StringType",
    requiredLevel: "None",
    isCustom: false,
    isManaged: false,
    isPrimaryId: false,
    isPrimaryName: false,
    sourceType: null,
    introducedVersion: null,
    metadataId: null,
    columnNumber: null,
    isValidForCreate: null,
    isValidForUpdate: null,
    isValidForRead: null,
    isValidForAdvancedFind: null,
    isAuditEnabled: null,
    isSecured: null,
    isFilterable: null,
    isRetrievable: null,
    maxLength: null,
    format: null,
    dateTimeBehavior: null,
    minValue: null,
    maxValue: null,
    precision: null,
    targets: null,
    relationships: null,
    optionSet: null,
    booleanOptions: null,
    defaultValue: null,
    ...overrides,
  };
}

export const accountTable = table({
  logicalName: "account",
  schemaName: "Account",
  displayName: "Account",
});
export const contactTable = table({
  logicalName: "contact",
  schemaName: "Contact",
  displayName: "Contact",
});
export const customTable = table({
  logicalName: "new_project",
  schemaName: "new_Project",
  displayName: "Project",
  isCustom: true,
});
export const unlabeledTable = table({ logicalName: "new_unlabeled", displayName: null });

export const tablesFixture: TablesResponse = {
  tables: [accountTable, contactTable, customTable, unlabeledTable],
};

export const accountAttributes: AttributeInfo[] = [
  attribute({
    logicalName: "name",
    schemaName: "Name",
    displayName: "Account Name",
    description: "Type the company or business name.",
    requiredLevel: "ApplicationRequired",
    isPrimaryName: true,
    maxLength: 160,
    format: "Text",
    isValidForCreate: true,
    isValidForUpdate: true,
    isValidForRead: true,
    isAuditEnabled: true,
    introducedVersion: "5.0.0.0",
    metadataId: "a-1",
  }),
  attribute({
    logicalName: "primarycontactid",
    schemaName: "PrimaryContactId",
    displayName: "Primary Contact",
    attributeType: "Lookup",
    attributeTypeName: "LookupType",
    targets: ["contact"],
    relationships: [{ schemaName: "account_primary_contact", referencedEntity: "contact" }],
  }),
  attribute({
    logicalName: "customerid",
    schemaName: "CustomerId",
    displayName: "Customer",
    attributeType: "Customer",
    attributeTypeName: "CustomerType",
    requiredLevel: "Recommended",
    targets: ["account", "contact"],
    relationships: [
      { schemaName: "account_customer_account", referencedEntity: "account" },
      { schemaName: "account_customer_contact", referencedEntity: "contact" },
    ],
  }),
  attribute({
    logicalName: "industrycode",
    schemaName: "IndustryCode",
    displayName: "Industry",
    attributeType: "Picklist",
    attributeTypeName: "PicklistType",
    defaultValue: "Accounting (1)",
    optionSet: {
      name: "account_industrycode",
      isGlobal: false,
      options: [
        { value: 1, label: "Accounting" },
        { value: 2, label: "Agriculture" },
      ],
    },
  }),
  attribute({
    logicalName: "donotemail",
    schemaName: "DoNotEMail",
    displayName: "Do not allow emails",
    attributeType: "Boolean",
    attributeTypeName: "BooleanType",
    booleanOptions: { trueLabel: "Do Not Allow", falseLabel: "Allow" },
    defaultValue: "Allow",
  }),
  attribute({
    logicalName: "revenue",
    schemaName: "Revenue",
    displayName: "Annual Revenue",
    attributeType: "Money",
    attributeTypeName: "MoneyType",
    minValue: "0",
    maxValue: "100000000000000",
    precision: 2,
    requiredLevel: "SystemRequired",
  }),
  attribute({ logicalName: "new_nolabel", schemaName: "new_NoLabel", displayName: null }),
];

export const accountResponse: TableAttributesResponse = {
  table: accountTable,
  attributes: accountAttributes,
};

export const contactResponse: TableAttributesResponse = {
  table: contactTable,
  attributes: [
    attribute({ logicalName: "fullname", schemaName: "FullName", displayName: "Full Name" }),
  ],
};

export const otherEnvironmentTables: TablesResponse = {
  tables: [table({ logicalName: "other_table", displayName: "Other Table" })],
};
