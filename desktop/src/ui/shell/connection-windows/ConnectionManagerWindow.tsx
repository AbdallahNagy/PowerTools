import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { desktopBridge, type ConnectionManagerRequest } from "../../platform/desktopBridge";
import {
  toConnectionInfo,
  type ConnectionInfo,
  type ConnectionSummary,
  type ImportPreview,
} from "../../shared/connections";
import { Alert, Badge, Button, Field, Input, Modal, SearchInput } from "../../shared/ui";
import { ConnectionGroupList, ProductionBadge } from "../connections/ConnectionGroupList";
import { ConnectionDescriptionFields } from "./ConnectionDescriptionFields";
import {
  draftFrom,
  useInstalledBrowsers,
  validateDraft,
  type DescriptionDraft,
} from "./connectionDraft";

type Notice = { tone: "ok" | "danger" | "info"; text: string } | null;

/** Electron prefixes errors from the main process; show only the message. */
function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

function matches(connection: ConnectionInfo, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [connection.displayName, connection.organization, connection.environment, connection.envUrl]
    .some((value) => value?.toLowerCase().includes(needle));
}

/** Lists every connection by organization and edits the selected one. */
const ConnectionManagerWindow = () => {
  const [summaries, setSummaries] = useState<ConnectionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const browsers = useInstalledBrowsers();

  const startImport = async () => {
    try {
      const preview = await desktopBridge.previewConnectionImport();
      if (preview) setImportPreview(preview);
    } catch (error) {
      setNotice({ tone: "danger", text: readableError(error) });
    }
  };
  // Requests arrive from the main process, outside React's render cycle.
  const handleRequest = useRef<(request: ConnectionManagerRequest) => void>(() => undefined);
  handleRequest.current = (request) => {
    if (request.selectId) setSelectedId(request.selectId);
    if (request.action === "import") void startImport();
  };

  useEffect(() => {
    let loaded = false;
    void Promise.all([
      desktopBridge.listConnections(),
      desktopBridge.takeConnectionManagerRequest(),
    ]).then(([list, request]) => {
      loaded = true;
      setSummaries(list);
      setSelectedId((current) => current ?? request?.selectId ?? list[0]?.id ?? null);
      if (request?.action) handleRequest.current(request);
    });
    const unsubscribeList = desktopBridge.onConnectionsUpdated((list) => {
      setSummaries(list);
      if (loaded) {
        setSelectedId((current) =>
          current && list.some((connection) => connection.id === current) ? current : list[0]?.id ?? null,
        );
      }
    });
    const unsubscribeSelect = desktopBridge.onConnectionManagerRequest((request) => {
      // Take it so the window does not handle it a second time after loading.
      void desktopBridge.takeConnectionManagerRequest();
      handleRequest.current(request);
    });
    return () => {
      unsubscribeList();
      unsubscribeSelect();
    };
  }, []);

  const connections = useMemo(() => summaries.map(toConnectionInfo), [summaries]);
  const visible = connections.filter((connection) => matches(connection, query));
  const selected = connections.find((connection) => connection.id === selectedId) ?? null;

  const exportAll = async () => {
    const result = await desktopBridge.exportConnections();
    if (result.cancelled) return;
    setNotice(
      result.success
        ? { tone: "ok", text: `Exported ${result.count ?? 0} connection${result.count === 1 ? "" : "s"}. Passwords are not included.` }
        : { tone: "danger", text: result.error ?? "Export failed." },
    );
  };

  return (
    <div className="box-border h-screen w-screen bg-canvas text-sm text-fg">
      <Group orientation="horizontal" className="flex h-full w-full">
        <Panel
          id="connections-list"
          defaultSize="300px"
          minSize="220px"
          maxSize="55%"
          className="flex min-h-0 min-w-0 flex-col bg-surface"
          // The panel sets an inline overflow; only the list below should scroll.
          style={{ overflow: "hidden" }}
        >
          <div className="flex flex-wrap items-center gap-1 border-b border-line p-2">
            <Button size="sm" onClick={() => void desktopBridge.createConnectionWindow()}>
              <Plus size={14} aria-hidden="true" /> Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void startImport()}>
              <Download size={14} aria-hidden="true" /> Import
            </Button>
            <Button size="sm" variant="ghost" disabled={connections.length === 0} onClick={() => void exportAll()}>
              <Upload size={14} aria-hidden="true" /> Export
            </Button>
          </div>
          <div className="p-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search connections" aria-label="Search connections" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2" role="listbox" aria-label="Connections">
            {connections.length === 0 ? (
              <p className="px-3 py-2 text-fg-muted">No connections yet. Add one or import a file.</p>
            ) : visible.length === 0 ? (
              <p className="px-3 py-2 text-fg-muted">No matching connections</p>
            ) : (
              <ConnectionGroupList
                connections={visible}
                ungroupedHint={<span className="truncate">· Update these to group them</span>}
                renderRow={(connection, label) => {
                  const active = connection.id === selectedId;
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={connection.displayName}
                      className={`flex w-full items-center gap-2 px-5 py-1.5 text-left ${
                        active ? "bg-accent-soft text-fg-strong" : "hover:bg-hover"
                      }`}
                      onClick={() => {
                        setSelectedId(connection.id);
                        setNotice(null);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {connection.needsPassword ? <Badge tone="warn">Password</Badge> : null}
                      <ProductionBadge connection={connection} />
                    </button>
                  );
                }}
              />
            )}
          </div>
        </Panel>
        <Separator
          aria-label="Resize connection list"
          className="w-1 cursor-col-resize bg-line hover:bg-accent active:bg-accent"
        />
        <Panel id="connection-editor" minSize="380px" className="min-h-0 min-w-0">
          <main className="h-full min-w-0 overflow-y-auto p-6">
            {notice ? (
              <Alert tone={notice.tone} className="mb-4">{notice.text}</Alert>
            ) : null}
            {selected ? (
              <ConnectionEditor
                key={selected.id}
                connection={selected}
                connections={summaries}
                browsers={browsers}
                onNotice={setNotice}
              />
            ) : (
              <p className="text-fg-muted">Select a connection to edit it.</p>
            )}
          </main>
        </Panel>
      </Group>

      {importPreview ? (
        <ImportDialog
          preview={importPreview}
          onClose={() => setImportPreview(null)}
          onImported={(count) => {
            setImportPreview(null);
            setNotice({ tone: "ok", text: `Imported ${count} connection${count === 1 ? "" : "s"}.` });
          }}
        />
      ) : null}
    </div>
  );
};

interface ConnectionEditorProps {
  connection: ConnectionInfo;
  connections: ConnectionSummary[];
  browsers: ReturnType<typeof useInstalledBrowsers>;
  onNotice: (notice: Notice) => void;
}

function ConnectionEditor({ connection, connections, browsers, onNotice }: ConnectionEditorProps) {
  const [draft, setDraft] = useState<DescriptionDraft>(() => draftFrom(connection));
  const [password, setPassword] = useState("");
  const [triedSave, setTriedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const original = draftFrom(connection);
  const dirty =
    draft.organization.trim() !== original.organization ||
    draft.environment.trim() !== original.environment ||
    JSON.stringify(draft.browser) !== JSON.stringify(original.browser) ||
    password.length > 0;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setTriedSave(true);
    if (Object.keys(validateDraft(draft, connections, connection.id)).length > 0) return;
    if (connection.needsPassword && !password) {
      setError("Enter the password for this connection.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await desktopBridge.updateConnection(connection.id, {
      organization: draft.organization.trim(),
      environment: draft.environment.trim(),
      browser: draft.browser,
      ...(password ? { password } : {}),
    });
    setSaving(false);
    if (result.success) {
      setPassword("");
      onNotice({ tone: "ok", text: "Saved." });
    } else {
      setError(result.error ?? "The connection could not be saved.");
    }
  };

  const testBrowser = async () => {
    try {
      const result = await desktopBridge.openUrlInBrowser(draft.browser, connection.envUrl);
      if (result.fallback) {
        onNotice({ tone: "info", text: "That browser or profile was not found, so the system default browser opened." });
      }
    } catch (err) {
      onNotice({ tone: "danger", text: (err as Error).message });
    }
  };

  const remove = async () => {
    const result = await desktopBridge.deleteConnection(connection.id);
    if (!result.success) setError(result.error ?? "The connection could not be deleted.");
  };

  return (
    <form onSubmit={save} className="flex w-full max-w-2xl flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg-strong">
          <span className="truncate">{connection.displayName}</span>
          <ProductionBadge connection={connection} />
        </h2>
        <p className="mt-0.5 truncate text-xs text-fg-muted" title={connection.envUrl}>
          {connection.envUrl} · {connection.crmType === "online" ? "Online" : "On-premises"}
        </p>
        {connection.legacyName ? (
          <Alert tone="info" className="mt-3">
            Was named <span className="font-medium text-fg-strong">{connection.legacyName}</span>. Add an organization and
            environment to move it out of Other.
          </Alert>
        ) : null}
      </div>

      <ConnectionDescriptionFields
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setError(null);
        }}
        connections={connections}
        browsers={browsers}
        envUrl={connection.envUrl}
        exceptId={connection.id}
        showRequired={triedSave}
      />

      <div>
        <Button variant="secondary" size="sm" onClick={() => void testBrowser()}>
          Test: open this environment
        </Button>
      </div>

      {connection.crmType === "onpremise" ? (
        <Field
          label={connection.needsPassword ? "Password" : "Change password"}
          hint={connection.needsPassword ? "Imported connections need their password once." : "Leave empty to keep the current password."}
        >
          <Input
            type="password"
            value={password}
            autoComplete="new-password"
            className="bg-raised"
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" disabled={!dirty || saving} onClick={() => {
          setDraft(original);
          setPassword("");
          setError(null);
          setTriedSave(false);
        }}>
          Discard
        </Button>
        <span className="flex-1" />
        {confirmingDelete ? (
          <span className="flex items-center gap-2">
            <span>Delete this connection?</span>
            <Button variant="danger" size="sm" onClick={() => void remove()}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
            Delete…
          </Button>
        )}
      </div>
    </form>
  );
}

const STATUS_LABELS: Record<ImportPreview["items"][number]["status"], string> = {
  new: "New",
  duplicate: "Already added",
  ungrouped: "Goes under Other",
  unsupported: "Not supported",
};

function ImportDialog({
  preview,
  onClose,
  onImported,
}: {
  preview: ImportPreview;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const importable = preview.items.filter((item) => item.status === "new" || item.status === "ungrouped");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(importable.map((item) => item.key)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    setBusy(true);
    setError(null);
    const result = await desktopBridge.commitConnectionImport([...chosen]);
    setBusy(false);
    if (result.success) onImported(result.imported ?? 0);
    else setError(result.error ?? "Import failed.");
  };

  return (
    <Modal
      open
      title={`Import from ${preview.source === "xrmtoolbox" ? "XrmToolBox" : "Power Tools"}`}
      description={preview.fileName}
      onClose={onClose}
      busy={busy}
      busyLabel="Importing…"
    >
      <div className="flex flex-col gap-3 text-sm">
        {preview.items.length === 0 ? (
          <p className="text-fg-muted">The file has no connections.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto rounded-sm border border-line">
            {preview.items.map((item) => {
              const disabled = item.status === "duplicate" || item.status === "unsupported";
              const name = item.organization && item.environment
                ? `${item.organization} · ${item.environment}`
                : item.legacyName ?? item.envUrl;
              return (
                <li key={item.key} className="flex items-start gap-2 border-b border-line px-3 py-2 last:border-b-0">
                  <input
                    type="checkbox"
                    className="mt-1 accent-accent"
                    aria-label={name}
                    disabled={disabled}
                    checked={!disabled && chosen.has(item.key)}
                    onChange={(event) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(item.key);
                        else next.delete(item.key);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate ${disabled ? "text-fg-muted" : "text-fg-strong"}`}>{name}</span>
                      <Badge tone={item.status === "new" ? "accent" : item.status === "ungrouped" ? "warn" : "neutral"}>
                        {STATUS_LABELS[item.status]}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-fg-muted">{item.envUrl}</p>
                    {item.reason ? <p className="text-xs text-fg-muted">{item.reason}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-fg-muted">
          Passwords are never imported. On-premises connections ask for theirs once; online connections sign in on first use.
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={chosen.size === 0 || busy} onClick={() => void commit()}>
            Import {chosen.size}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ConnectionManagerWindow;
