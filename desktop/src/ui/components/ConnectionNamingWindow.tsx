import React, { useState } from "react";

const ConnectionNamingWindow = () => {
  const [connectionName, setConnectionName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (connectionName.trim()) {
      window.electron.saveConnectionName(connectionName);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col justify-center px-6 py-4 box-border gap-3">
      <div>
        <h3 className="font-bold text-white mb-1">Name this Connection</h3>
        <p className="text-xs text-gray-400">
          Give this connection a friendly name (e.g. "Contoso Prod").
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
        <div className="flex flex-col gap-1">
          <label htmlFor="connectionName" className="text-xs">
            Connection Name
          </label>
          <input
            type="text"
            id="connectionName"
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] p-2 rounded-sm focus:outline-none focus:border-[#007fd4]"
            autoFocus
          />
        </div>

        <button
          type="submit"
          disabled={!connectionName.trim()}
          className="bg-[#007fd4] hover:bg-[#0069b4] text-white py-2 px-4 rounded-sm font-thin transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </form>
    </div>
  );
};

export default ConnectionNamingWindow;
