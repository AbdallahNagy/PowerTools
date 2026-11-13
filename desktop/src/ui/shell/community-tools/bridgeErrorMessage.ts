/** Electron prefixes a handler's error with the channel; show only the handler's own message. */
export function bridgeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, "");
}
