import type { Plugin } from "vite";

// The renderer only loads its own bundle and talks to the local sidecar on a
// random 127.0.0.1 port. Dataverse and sign-in traffic stays in the main
// process and the sidecar, so nothing else is allowed here.
const SIDECAR_ORIGIN = "http://127.0.0.1:*";

export function buildContentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Vite dev injects an inline React Refresh preamble. Builds have none.
    "script-src": dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    // Radix and virtualized lists set inline style attributes.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": dev
      ? ["'self'", SIDECAR_ORIGIN, "ws://localhost:*"]
      : ["'self'", SIDECAR_ORIGIN],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
    "frame-src": ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

export function contentSecurityPolicyPlugin(): Plugin {
  let dev = false;
  return {
    name: "power-tools-content-security-policy",
    configResolved(config) {
      dev = config.command === "serve";
    },
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: buildContentSecurityPolicy({ dev }),
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}
