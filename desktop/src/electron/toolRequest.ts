// Mirrors buildToolRequestUrl in src/ui/shared/links/toolRequest.ts for the
// native Help menu. The Electron build cannot import renderer modules.
export function toolRequestUrl(appVersion: string): string {
  const params = new URLSearchParams({
    template: "tool-request.yml",
    title: "[Tool request]: ",
    source: `desktop ${appVersion}`,
  });
  return `https://github.com/AbdallahNagy/PowerTools/issues/new?${params.toString()}`;
}
