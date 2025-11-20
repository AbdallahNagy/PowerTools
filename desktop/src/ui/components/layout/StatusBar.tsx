import { useEffect, useState } from "react";

const StatusBar = () => {
  const [connectionName, setConnectionName] = useState<string | null>(null);

  useEffect(() => {
    window.electron.onConnectionStatusUpdate((name) => {
      setConnectionName(name);
    });
  }, []);

  return (
    <div className="h-6 bg-(--blue-color) flex items-center justify-between px-2 text-white text-xs select-none">
      <div className="flex items-center space-x-2">
        <span>
          {connectionName ? `Connected: (${connectionName})` : "Not Connected"}
        </span>
      </div>
      <div className="flex items-center space-x-4">
        <span>v1.0.0</span>
      </div>
    </div>
  );
};

export default StatusBar;
