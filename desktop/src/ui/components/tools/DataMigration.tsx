import { useState } from "react";
import { useAccounts } from "../../api/hooks/useAccounts";

const DataMigration = () => {
  const [run, setRun] = useState(false);
  const { data, error, isFetching, refetch } = useAccounts(run);

  const handleClick = () => {
    if (!run) {
      setRun(true);
    } else {
      refetch();
    }
  };

  return (
    <div className="p-4 text-white">
      <h2 className="text-xl font-bold mb-4">Data Migration Tool</h2>

      <button
        onClick={handleClick}
        disabled={isFetching}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium"
      >
        {isFetching ? "Loading..." : "Test Connection (Get Accounts)"}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-900/40 border border-red-700 rounded text-sm text-red-200">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <pre className="mt-4 p-3 bg-gray-800 rounded text-xs overflow-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default DataMigration;
