import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTabConnection } from "../../shared/connections";
import { useToast } from "../../shared/ui";
import { useTableAttributes, useTables } from "./api/attributeExplorerApi";
import { attributeExplorerKeys } from "./api/queryKeys";
import { toAttributeExplorerError } from "./model/apiError";
import { filterAttributes, filterTables } from "./model/search";
import { DEFAULT_SORT, nextSort, sortAttributes, type SortKey, type SortState } from "./model/sort";

/** Selection, searches, queries, and the refresh flow for one Attribute Explorer tab. */
export function useAttributeExplorer() {
  const { connectionName } = useTabConnection();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const connection = connectionName || null;

  const [tableQuery, setTableQuery] = useState("");
  const [fieldQuery, setFieldQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [openFieldName, setOpenFieldName] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  useEffect(() => {
    setTableQuery("");
    setFieldQuery("");
    setSelectedName(null);
    setOpenFieldName(null);
    setSort(DEFAULT_SORT);
  }, [connectionName]);

  const tablesQuery = useTables(connection);
  const tables = useMemo(() => tablesQuery.data?.tables ?? [], [tablesQuery.data]);
  const selectedTable = useMemo(
    () => tables.find((table) => table.logicalName === selectedName) ?? null,
    [tables, selectedName],
  );
  const attributesQuery = useTableAttributes(connection, selectedTable?.logicalName ?? null);
  const attributes = useMemo(() => attributesQuery.data?.attributes ?? [], [attributesQuery.data]);

  const fields = useMemo(
    () => sortAttributes(filterAttributes(attributes, fieldQuery), sort),
    [attributes, fieldQuery, sort],
  );
  const openField = useMemo(
    () => attributes.find((attribute) => attribute.logicalName === openFieldName) ?? null,
    [attributes, openFieldName],
  );
  const knownTables = useMemo(() => new Set(tables.map((table) => table.logicalName)), [tables]);

  useEffect(() => {
    if (!tablesQuery.isError) return;
    showToast(toAttributeExplorerError(tablesQuery.error), "error");
  }, [tablesQuery.error, tablesQuery.isError, showToast]);

  useEffect(() => {
    if (!attributesQuery.isError) return;
    showToast(toAttributeExplorerError(attributesQuery.error), "error");
  }, [attributesQuery.error, attributesQuery.isError, showToast]);

  const tablesLoading = tablesQuery.isFetching && !tablesQuery.data;
  const tablesError =
    tablesQuery.isError && !tablesQuery.data ? toAttributeExplorerError(tablesQuery.error) : null;
  const fieldsLoading =
    !!selectedTable && attributesQuery.isFetching && !attributesQuery.data;
  const fieldsError =
    attributesQuery.isError && !attributesQuery.data
      ? toAttributeExplorerError(attributesQuery.error)
      : null;
  const busy = tablesQuery.isFetching || (!!selectedTable && attributesQuery.isFetching);

  const status = useMemo(() => {
    if (!connection) return "No environment selected";
    if (tablesLoading) return "Loading tables…";
    if (tablesError) return "Could not load tables";
    if (selectedTable) {
      if (fieldsLoading) return `Loading fields for ${selectedTable.logicalName}…`;
      if (fieldsError) return `Could not load fields for ${selectedTable.logicalName}`;
      if (attributesQuery.data) {
        return `${selectedTable.logicalName}: ${attributes.length} fields`;
      }
    }
    if (tablesQuery.data) return `${tables.length} tables`;
    return "Loading tables…";
  }, [
    attributes.length,
    attributesQuery.data,
    connection,
    fieldsError,
    fieldsLoading,
    selectedTable,
    tables.length,
    tablesError,
    tablesLoading,
    tablesQuery.data,
  ]);

  const selectTable = useCallback((logicalName: string) => {
    setSelectedName(logicalName);
    setFieldQuery("");
    setOpenFieldName(null);
  }, []);

  /** Used by the related-table link: close the modal and make sure the table is visible. */
  const openRelatedTable = useCallback(
    (logicalName: string) => {
      if (filterTables(tables, tableQuery).every((table) => table.logicalName !== logicalName)) {
        setTableQuery("");
      }
      selectTable(logicalName);
    },
    [selectTable, tableQuery, tables],
  );

  const toggleSort = useCallback((key: SortKey) => setSort((current) => nextSort(current, key)), []);

  const { refetch: refetchTables } = tablesQuery;
  const { refetch: refetchAttributes } = attributesQuery;
  const refresh = useCallback(async () => {
    if (!connection) return;
    const tablesResult = await refetchTables();
    if (tablesResult.isError || !tablesResult.data) return;

    // Fields cached for other tables are stale too; they reload when next selected.
    await queryClient.invalidateQueries({
      queryKey: attributeExplorerKeys.allAttributes(connection),
      refetchType: "none",
    });

    let failed = false;
    if (selectedName) {
      const stillThere = tablesResult.data.tables.some((table) => table.logicalName === selectedName);
      if (!stillThere) {
        setSelectedName(null);
        setFieldQuery("");
        setOpenFieldName(null);
      } else {
        const attributesResult = await refetchAttributes();
        failed = attributesResult.isError;
      }
    }

    if (!failed) showToast("Metadata refreshed", "success");
  }, [connection, queryClient, refetchAttributes, refetchTables, selectedName, showToast]);

  return {
    connectionName: connection,
    status,
    busy,
    tables,
    tablesLoading,
    tablesError,
    tableQuery,
    setTableQuery,
    selectedTable,
    selectTable,
    openRelatedTable,
    fields,
    totalFields: attributes.length,
    fieldsLoading,
    fieldsError,
    fieldQuery,
    setFieldQuery,
    sort,
    toggleSort,
    openField,
    openFieldByName: setOpenFieldName,
    closeField: () => setOpenFieldName(null),
    knownTables,
    refresh,
    retryTables: () => void refetchTables(),
    retryFields: () => void refetchAttributes(),
  };
}
