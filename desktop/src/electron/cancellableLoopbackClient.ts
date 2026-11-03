import { createServer, type Server } from "http";
import type { ILoopbackClient } from "@azure/msal-node";

type AuthCodeResponse = Awaited<ReturnType<ILoopbackClient["listenForAuthCode"]>>;

export class SignInCancelledError extends Error {
  constructor() {
    super("Sign-in was cancelled.");
    this.name = "SignInCancelledError";
  }
}

/**
 * Loopback redirect server for MSAL interactive sign-in that can be cancelled.
 *
 * MSAL's built-in loopback server waits for the redirect forever, so closing
 * the sign-in window would leave acquireTokenInteractive pending. Calling
 * cancel() rejects the pending listener; MSAL then throws and closes the
 * server in its own `finally`.
 */
export class CancellableLoopbackClient implements ILoopbackClient {
  private server: Server | undefined;
  private rejectPending: ((reason: Error) => void) | undefined;
  private settled = false;

  listenForAuthCode(successTemplate?: string, errorTemplate?: string): Promise<AuthCodeResponse> {
    if (this.server) {
      return Promise.reject(new Error("Loopback server already exists."));
    }
    return new Promise<AuthCodeResponse>((resolve, reject) => {
      const settle = (fn: () => void) => {
        if (this.settled) return;
        this.settled = true;
        this.rejectPending = undefined;
        fn();
      };
      this.rejectPending = (reason) => settle(() => reject(reason));

      this.server = createServer((req, res) => {
        const url = req.url;
        if (!url) {
          res.end(errorTemplate || "Error occurred loading redirectUrl");
          settle(() => reject(new Error("Unable to load redirect URL.")));
          return;
        }
        if (url === "/") {
          res.end(successTemplate || "Sign-in complete. You can close this window now.");
          return;
        }
        const redirectUri = this.getRedirectUri();
        const params = new URL(url, redirectUri).searchParams;
        const response = Object.fromEntries(params.entries()) as AuthCodeResponse;
        if (response.code) {
          // Redirect so the auth code does not stay in the window history.
          res.writeHead(302, { location: redirectUri });
          res.end();
        } else if (response.error) {
          res.end(errorTemplate || `Error occurred: ${response.error}`);
        } else {
          // Not an auth response (e.g. favicon); keep waiting.
          res.statusCode = 404;
          res.end();
          return;
        }
        settle(() => resolve(response));
      });
      this.server.on("error", (err) => settle(() => reject(err)));
      this.server.listen(0, "127.0.0.1");
    });
  }

  getRedirectUri(): string {
    const address = this.server?.listening ? this.server.address() : null;
    if (!address || typeof address === "string" || !address.port) {
      throw new Error("No loopback server is listening.");
    }
    return `http://localhost:${address.port}`;
  }

  /** Abort a pending sign-in. No effect once an auth response has arrived. */
  cancel(reason: Error = new SignInCancelledError()): void {
    this.rejectPending?.(reason);
  }

  closeServer(): void {
    if (!this.server) return;
    this.server.close();
    this.server.closeAllConnections?.();
    this.server.unref();
    this.server = undefined;
  }
}
