import { execFileSync } from "node:child_process";

const CLOSE_TIMEOUT_MS = 8_000;

export async function disposeElectronApp(
  electronApp: { close(): Promise<void>; process(): { pid?: number } } | undefined,
  userDataDir: string,
): Promise<void> {
  const pid = electronApp?.process().pid;
  try {
    if (electronApp) {
      await Promise.race([
        electronApp.close(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Electron close timed out")), CLOSE_TIMEOUT_MS);
        }),
      ]);
    }
  } catch {
    if (pid) {
      try {
        process.kill(pid);
      } catch {
        // Process already exited.
      }
    }
  }

  killProcessesWithUserDataDir(userDataDir);
}

function killProcessesWithUserDataDir(userDataDir: string): void {
  const pids =
    process.platform === "win32"
      ? listWindowsPids(userDataDir)
      : listPosixPids(userDataDir);

  for (const pid of pids) {
    if (pid === process.pid) continue;
    try {
      process.kill(pid);
    } catch {
      // Process already exited.
    }
  }
}

function listWindowsPids(userDataDir: string): number[] {
  try {
    const escaped = userDataDir.replace(/'/g, "''");
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${escaped}*' } | ForEach-Object { $_.ProcessId }`,
      ],
      { encoding: "utf8", timeout: 5_000 },
    );
    return parsePids(output);
  } catch {
    return [];
  }
}

function listPosixPids(userDataDir: string): number[] {
  try {
    const output = execFileSync("ps", ["-eo", "pid=,args="], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return output
      .split("\n")
      .filter((line) => line.includes(userDataDir))
      .flatMap((line) => parsePids(line.trim().split(/\s+/, 1)[0] ?? ""));
  } catch {
    return [];
  }
}

function parsePids(output: string): number[] {
  return output
    .split(/\s+/)
    .map((token) => Number(token))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}
