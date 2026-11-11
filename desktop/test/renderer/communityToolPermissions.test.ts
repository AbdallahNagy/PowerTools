import { describe, expect, it } from "vitest";
import { METHODS, type MethodName, type Permission } from "@powertools/sdk/protocol";
import { authorize, METHOD_PERMISSION } from "../../src/ui/shell/community-tools/permissions";

const ALL: Permission[] = ["data:read", "data:write", "data:delete", "metadata:read", "metadata:write", "files"];

const SIMPLE: Record<Exclude<MethodName, "data.execute" | "data.batch">, Permission | null> = {
  "connection.get": null,
  "data.retrieve": "data:read",
  "data.fetchXml": "data:read",
  "data.create": "data:write",
  "data.update": "data:write",
  "data.delete": "data:delete",
  "data.associate": "data:write",
  "data.disassociate": "data:write",
  "metadata.tables": "metadata:read",
  "metadata.table": "metadata:read",
  "metadata.columns": "metadata:read",
  "metadata.relationships": "metadata:read",
  "metadata.choices": "metadata:read",
  "shell.toast": null,
  "shell.setStatus": null,
  "shell.confirm": null,
  "shell.openRecord": null,
  "shell.openSolution": null,
  "shell.openFile": "files",
  "shell.saveFile": "files",
  "shell.copyText": null,
  "shell.shortcut": null,
  "storage.get": null,
  "storage.set": null,
  "storage.remove": null,
};

const manifest = (permissions: string[] = [], messages: string[] = []) => ({ permissions, messages });

describe("community tool permissions", () => {
  it.each(METHODS.filter((m) => m !== "data.execute" && m !== "data.batch"))("%s", (method) => {
    const needed = SIMPLE[method as keyof typeof SIMPLE];
    expect(METHOD_PERMISSION[method]).toBe(needed);
    if (needed === null) {
      expect(authorize(manifest(), method, {})).toEqual({ ok: true, needs: [] });
      return;
    }
    expect(authorize(manifest(), method, {}).ok).toBe(false);
    expect(authorize(manifest(ALL.filter((p) => p !== needed)), method, {}).ok).toBe(false);
    expect(authorize(manifest([needed]), method, {})).toEqual({ ok: true, needs: [needed] });
  });

  it("marks execute and batch as resolved from arguments", () => {
    expect(METHOD_PERMISSION["data.execute"]).toBe("per-message");
    expect(METHOD_PERMISSION["data.batch"]).toBe("per-operation");
  });

  describe("data.execute", () => {
    const args = { message: "PublishXml", parameters: {} };

    it("is denied when the message is not declared", () => {
      const result = authorize(manifest(["metadata:write"]), "data.execute", args);
      expect(result).toEqual({ ok: false, message: 'Message "PublishXml" is not declared in powertools-tool.json' });
    });

    it("is denied when declared without the implied permission", () => {
      expect(authorize(manifest([], ["PublishXml"]), "data.execute", args).ok).toBe(false);
    });

    it("is allowed when declared with the implied permission", () => {
      expect(authorize(manifest(["metadata:write"], ["PublishXml"]), "data.execute", args)).toEqual({
        ok: true,
        needs: ["metadata:write"],
      });
    });

    it("allows a declared message that implies no permission", () => {
      expect(authorize(manifest([], ["WhoAmI"]), "data.execute", { message: "WhoAmI", parameters: {} }).ok).toBe(true);
    });

    it("allows an unknown message that is declared", () => {
      expect(
        authorize(manifest([], ["new_CustomAction"]), "data.execute", { message: "new_CustomAction", parameters: {} }).ok,
      ).toBe(true);
    });

    it("does not treat inherited object keys as known messages", () => {
      expect(authorize(manifest([], ["constructor"]), "data.execute", { message: "constructor", parameters: {} })).toEqual({
        ok: true,
        needs: [],
      });
    });

    it("rejects a missing message name", () => {
      expect(authorize(manifest(), "data.execute", {}).ok).toBe(false);
    });
  });

  describe("data.batch", () => {
    const batch = (...ops: string[]) => ({
      operations: ops.map((op) => ({ op, table: "account", id: "1", values: {} })),
      continueOnError: false,
    });

    it("is denied when one delete lacks data:delete", () => {
      expect(authorize(manifest(["data:write"]), "data.batch", batch("create", "update", "delete")).ok).toBe(false);
    });

    it("is allowed when every operation is covered", () => {
      expect(authorize(manifest(["data:write", "data:delete"]), "data.batch", batch("create", "delete"))).toEqual({
        ok: true,
        needs: ["data:write", "data:delete"],
      });
    });

    it("needs nothing for an empty batch", () => {
      expect(authorize(manifest(), "data.batch", batch())).toEqual({ ok: true, needs: [] });
    });

    it("rejects an unknown operation", () => {
      expect(authorize(manifest(["data:write", "data:delete"]), "data.batch", batch("toString")).ok).toBe(false);
    });
  });
});
