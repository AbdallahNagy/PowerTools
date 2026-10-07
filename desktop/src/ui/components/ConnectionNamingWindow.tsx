import React, { useState } from "react";
import { desktopBridge } from "../platform/desktopBridge";
import { Field, Input } from "../shared/ui";

const ConnectionNamingWindow = () => {
  const [connectionName, setConnectionName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (connectionName.trim()) {
      desktopBridge.saveConnectionName(connectionName);
    }
  };

  return (
    <div className="h-screen w-screen bg-canvas text-fg flex flex-col justify-center px-6 py-4 box-border gap-3">
      <div>
        <h3 className="font-bold text-fg-strong mb-1">Name this Connection</h3>
        <p className="text-xs text-fg-muted">
          Give this connection a friendly name (e.g. "Contoso Prod").
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
        <Field label="Connection Name" id="connectionName">
          <Input
            type="text"
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            className="p-2 bg-raised"
            autoFocus
          />
        </Field>

        <button
          type="submit"
          disabled={!connectionName.trim()}
          className="bg-accent hover:bg-accent-hover text-accent-fg py-2 px-4 rounded-sm font-thin transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </form>
    </div>
  );
};

export default ConnectionNamingWindow;
