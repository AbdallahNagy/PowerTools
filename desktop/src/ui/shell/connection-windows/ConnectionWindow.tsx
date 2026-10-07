import React, { useState } from "react";
import { desktopBridge } from "../../platform/desktopBridge";
import { Field, Input } from "../../shared/ui";

type ConnectionFormData = {
  crmType: "online" | "onpremise";
  authMode: "ad" | "ifd";
  serverUrl: string;
  username: string;
  password: string;
  domain: string;
};

const ConnectionWindow = () => {
  const [formData, setFormData] = useState<ConnectionFormData>({
    crmType: "online",
    authMode: "ad",
    serverUrl: "",
    username: "",
    password: "",
    domain: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await desktopBridge.saveConnectionData(
      formData.crmType === "online"
        ? { crmType: "online", serverUrl: formData.serverUrl }
        : {
            crmType: "onpremise",
            serverUrl: formData.serverUrl,
            authMode: formData.authMode,
            username: formData.username,
            password: formData.password,
            domain: formData.domain,
          },
    );

    if (!result.success) {
      setLoading(false);
      setError(result.error ?? "Authentication failed.");
    }
    // On success, main process closes this window — no further action needed.
  };

  const isOnline = formData.crmType === "online";

  return (
    <div className="h-screen w-screen bg-canvas text-fg flex flex-col p-6 box-border overflow-y-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md w-full mx-auto">
        <h3 className="font-bold mb-6 text-fg-strong">Connect to Dynamics 365</h3>

        <div className="flex flex-col gap-2">
          <label className="text-xs">CRM Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="crmType"
                value="online"
                checked={formData.crmType === "online"}
                onChange={handleChange}
                className="accent-accent"
              />
              <span className="text-sm">Online</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="crmType"
                value="onpremise"
                checked={formData.crmType === "onpremise"}
                onChange={handleChange}
                className="accent-accent"
              />
              <span className="text-sm">On-Premise</span>
            </label>
          </div>
        </div>

        <Field label="Server URL" id="serverUrl" hint={isOnline ? "A browser window will open for Microsoft login." : undefined}>
          <Input
            type="text"
            name="serverUrl"
            value={formData.serverUrl}
            onChange={handleChange}
            placeholder="org.crm.dynamics.com"
            className="p-2 bg-raised"
          />
        </Field>

        {!isOnline && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-xs">Authentication</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="authMode"
                    value="ad"
                    checked={formData.authMode === "ad"}
                    onChange={handleChange}
                    className="accent-accent"
                  />
                  <span className="text-sm">Active Directory</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="authMode"
                    value="ifd"
                    checked={formData.authMode === "ifd"}
                    onChange={handleChange}
                    className="accent-accent"
                  />
                  <span className="text-sm">IFD</span>
                </label>
              </div>
            </div>

            <Field label="Username / Email" id="username">
              <Input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className="p-2 bg-raised"
              />
            </Field>

            <Field label="Password" id="password">
              <Input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="p-2 bg-raised"
              />
            </Field>

            <Field label="Domain" id="domain">
              <Input
                type="text"
                name="domain"
                value={formData.domain}
                onChange={handleChange}
                className="p-2 bg-raised"
              />
            </Field>
          </>
        )}

        {error && <p className="text-sm text-danger bg-raised px-3 py-2 rounded-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-accent-fg py-2 px-4 rounded-sm font-medium transition-colors"
        >
          {loading ? "Authenticating…" : "Connect"}
        </button>
      </form>
    </div>
  );
};

export default ConnectionWindow;
