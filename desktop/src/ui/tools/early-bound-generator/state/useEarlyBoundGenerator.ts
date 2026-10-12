import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTabConnection } from "../../../shared/connections";
import { desktopBridge } from "../../../platform/desktopBridge";
import { useToast } from "../../../shared/ui";
import { fetchGenerationJob, startGeneration, useFolderInfo, useTableNames } from "../api/earlyBoundGeneratorApi";
import { describeFailure, toEarlyBoundGeneratorError } from "../model/apiError";
import { buildPacCommand } from "../model/command";
import { formatDuration, plural } from "../model/results";
import {
  DEFAULT_SETTINGS,
  applyLoadedSettings,
  expandTables,
  hasErrors,
  parseLines,
  toGenerationRequest,
  validateSettings,
} from "../model/settings";
import type { FormSettings, GeneratedFile } from "../model/types";

export const POLL_MS = 500;

export type RunState =
  | { phase: "idle" }
  | { phase: "environmentChanged"; environment: string }
  | { phase: "running" }
  | {
      phase: "succeeded";
      files: GeneratedFile[];
      outputDirectory: string;
      durationMs: number;
    }
  | { phase: "failed"; message: string; files: GeneratedFile[] };

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Form, folder, command, and the generation run for one Early Bound Generator tab. */
export function useEarlyBoundGenerator() {
  const { connectionName } = useTabConnection();
  const connection = connectionName || null;
  const { showToast } = useToast();

  const [settings, setSettings] = useState<FormSettings>(DEFAULT_SETTINGS);
  const [folder, setFolder] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Folders this tab already confirmed generating into. */
  const confirmedFolders = useRef(new Set<string>());
  /** Folders whose builderSettings.json was already loaded into the form. */
  const loadedFolders = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Keep settings and folder when the environment changes; clear the results.
  const [stateConnection, setStateConnection] = useState(connection);
  if (stateConnection !== connection) {
    setStateConnection(connection);
    if (run.phase !== "running") {
      setRun(stateConnection && connection ? { phase: "environmentChanged", environment: connection } : { phase: "idle" });
    }
  }

  const tablesQuery = useTableNames(connection);
  const folderQuery = useFolderInfo(connection, folder);
  const knownTables = tablesQuery.data?.tables ?? null;

  const tables = useMemo(() => expandTables(settings.tablesText, knownTables), [knownTables, settings.tablesText]);
  const errors = useMemo(() => validateSettings(settings, tables), [settings, tables]);
  const request = useMemo(() => toGenerationRequest(folder ?? "", settings, tables), [folder, settings, tables]);
  const command = useMemo(() => buildPacCommand(request), [request]);

  const folderInfo = folderQuery.data ?? null;

  // Load builderSettings.json into the form the first time a folder's settings arrive.
  useEffect(() => {
    if (!folderInfo || !folder || folderInfo.path !== folder) return;
    if (loadedFolders.current.has(folder)) return;
    loadedFolders.current.add(folder);
    if (folderInfo.settings) {
      setSettings((current) => applyLoadedSettings(current, folderInfo.settings!));
      showToast("Loaded settings from builderSettings.json.", "info");
    }
  }, [folder, folderInfo, showToast]);

  const tablesNeeded = parseLines(settings.tablesText).length > 0;
  const running = run.phase === "running";

  const disabledReason = useMemo(() => {
    if (!connection) return "Connect to an environment first.";
    if (!folder) return "Choose an output folder first.";
    if (hasErrors(errors)) return "Fix the settings marked in red first.";
    if (tablesNeeded && tablesQuery.isPending) return "Loading the environment's tables...";
    if (tablesNeeded && tablesQuery.isError) return "The environment's tables could not be loaded. Select Retry under Tables.";
    if (folderQuery.isPending) return "Reading the output folder...";
    return null;
  }, [connection, errors, folder, folderQuery.isPending, tablesNeeded, tablesQuery.isError, tablesQuery.isPending]);

  const update = useCallback(<Key extends keyof FormSettings>(key: Key, value: FormSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const chooseFolder = useCallback(async () => {
    const chosen = await desktopBridge.selectDirectory(folder ?? undefined);
    if (!chosen || !mounted.current) return;
    if (chosen !== folder) loadedFolders.current.delete(chosen);
    setFolder(chosen);
  }, [folder]);

  const generate = useCallback(async () => {
    if (!connection || !folder) return;
    setConfirmOpen(false);
    // Generated files now live here; do not ask again in this tab.
    confirmedFolders.current.add(folder);
    setRun({ phase: "running" });

    const fail = (message: string, files: GeneratedFile[] = []) => {
      if (!mounted.current) return;
      setRun({ phase: "failed", message, files });
      showToast("Generation failed.", "error");
    };

    let jobId: string;
    try {
      jobId = (await startGeneration(connection, request)).jobId;
    } catch (error) {
      fail(toEarlyBoundGeneratorError(error));
      return;
    }

    for (;;) {
      await delay(POLL_MS);
      if (!mounted.current) return;
      let job;
      try {
        job = await fetchGenerationJob(connection, jobId);
      } catch (error) {
        fail(toEarlyBoundGeneratorError(error));
        return;
      }
      if (!mounted.current) return;

      if (job.state === "succeeded") {
        setRun({
          phase: "succeeded",
          files: job.files,
          outputDirectory: job.outputDirectory || folder,
          durationMs: job.durationMs ?? 0,
        });
        showToast(`Generated ${plural(job.files.length, "file")}.`, "success");
        return;
      }

      if (job.state === "failed") {
        fail(describeFailure(job.errorKind, job.error, connection), job.files);
        return;
      }
    }
  }, [connection, folder, request, showToast]);

  const requestGenerate = useCallback(() => {
    if (disabledReason || running || !folder) return;
    if (folderInfo?.hasOtherFiles && !confirmedFolders.current.has(folder)) {
      setConfirmOpen(true);
      return;
    }
    void generate();
  }, [disabledReason, folder, folderInfo?.hasOtherFiles, generate, running]);

  const confirmGenerate = useCallback(() => {
    void generate();
  }, [generate]);

  const openFolder = useCallback(async (path: string) => {
    const result = await desktopBridge.openPath(path);
    if (!result.success) showToast(result.error ?? "The folder could not be opened.", "error");
  }, [showToast]);

  const status = useMemo(() => {
    switch (run.phase) {
      case "running":
        return "Generating early-bound classes...";
      case "succeeded":
        return `Generated ${plural(run.files.length, "file")} in ${formatDuration(run.durationMs)}`;
      case "failed":
        return "Generation failed";
      default:
        return null;
    }
  }, [run]);

  return {
    connectionName: connection,
    settings,
    update,
    errors,
    tables,
    tablesQuery,
    folder,
    folderInfo,
    chooseFolder,
    command,
    run,
    running,
    disabledReason,
    requestGenerate,
    confirmOpen,
    closeConfirm: () => setConfirmOpen(false),
    confirmGenerate,
    openFolder,
    status,
  };
}
