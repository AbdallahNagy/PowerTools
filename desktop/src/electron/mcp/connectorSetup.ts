import { join } from "node:path";
import {
  bundledConnectorFolder,
  connectorInstallFolder,
  connectorLaunch,
  type ConnectorLaunch,
} from "./connectorCommand.js";
import { describeConnectorInstall, installConnector, type ConnectorInstallFs } from "./connectorInstall.js";
import { knownClientConfigs, scanLegacySetups, type LegacySetup } from "./legacySetups.js";

export interface ConnectorSetupDeps {
  packaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
  appPath: () => string;
  homePath: () => string;
  appDataPath: () => string;
  localAppData: string | undefined;
  /** "Power Tools", or the dev userData folder name in development. */
  appFolderName: () => string;
  log?: Pick<Console, "info" | "error">;
  fs?: ConnectorInstallFs;
}

export interface ConnectorSetup {
  /** Copies the bundled connector to the per-user folder. Resolves even when that fails. */
  install(): Promise<void>;
  launch(discoveryPath: string): ConnectorLaunch;
  legacySetups(): Promise<LegacySetup[]>;
}

/** Where MCP clients start the connector from, and keeping that copy current. */
export function createConnectorSetup(deps: ConnectorSetupDeps): ConnectorSetup {
  const log = deps.log ?? console;
  const paths = () => ({ packaged: deps.packaged, resourcesPath: deps.resourcesPath, appPath: deps.appPath() });
  const connectorDir = () =>
    connectorInstallFolder(deps.localAppData ?? join(deps.homePath(), "AppData", "Local"), deps.appFolderName());

  return {
    async install() {
      // The copy is what lets updates replace the installed files while a client runs; only Windows locks them.
      if (deps.platform !== "win32") return;
      try {
        const targetDir = connectorDir();
        const result = await installConnector({ sourceDir: bundledConnectorFolder(paths()), targetDir, fs: deps.fs });
        const message = describeConnectorInstall(result, targetDir);
        if (message) (result.status === "failed" ? log.error : log.info)(message);
      } catch (error) {
        log.error("Could not copy the MCP connector:", error);
      }
    },
    launch(discoveryPath) {
      return connectorLaunch({ ...paths(), platform: deps.platform, discoveryPath, connectorDir: connectorDir() });
    },
    async legacySetups() {
      // Elsewhere the deprecated command is still the current one.
      if (deps.platform !== "win32") return [];
      return scanLegacySetups(knownClientConfigs({ homeDir: deps.homePath(), appData: deps.appDataPath() }));
    },
  };
}
