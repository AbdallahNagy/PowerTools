import React, { useState } from "react";

const ConnectionWindow = () => {
  const [formData, setFormData] = useState({
    crmType: "online",
    serverUrl: "",
    username: "",
    password: "",
    domain: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    console.log("formData", formData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    window.electron.saveConnectionData(formData);
  };

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col p-6 box-border overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 max-w-md w-full mx-auto"
      >
        <h3 className="font-bold mb-6 text-white">Connect to Dynamics 365</h3>

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
                className="accent-[#007fd4]"
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
                className="accent-[#007fd4]"
              />
              <span className="text-sm">On-Premise</span>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="serverUrl" className="text-xs">
            Server URL
          </label>
          <input
            type="text"
            name="serverUrl"
            id="serverUrl"
            value={formData.serverUrl}
            onChange={handleChange}
            placeholder="org.crm.dynamics.com"
            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] p-2 rounded-sm focus:outline-none focus:border-[#007fd4]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-xs">
            Username
          </label>
          <input
            type="text"
            name="username"
            id="username"
            value={formData.username}
            onChange={handleChange}
            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] p-2 rounded-sm focus:outline-none focus:border-[#007fd4]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-xs">
            Password
          </label>
          <input
            type="password"
            name="password"
            id="password"
            value={formData.password}
            onChange={handleChange}
            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] p-2 rounded-sm focus:outline-none focus:border-[#007fd4]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="domain" className="text-xs">
            Domain
          </label>
          <input
            type="text"
            name="domain"
            id="domain"
            value={formData.domain}
            onChange={handleChange}
            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] p-2 rounded-sm focus:outline-none focus:border-[#007fd4]"
          />
        </div>

        <button
          type="submit"
          className="mt-4 bg-[#007fd4] hover:bg-[#0069b4] text-white py-2 px-4 rounded-sm font-thin transition-colors"
        >
          Connect
        </button>
      </form>
    </div>
  );
};

export default ConnectionWindow;
