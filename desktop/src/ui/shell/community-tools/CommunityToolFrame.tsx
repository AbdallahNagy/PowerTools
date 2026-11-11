import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  CONNECT_MESSAGE,
  PROTOCOL_VERSION,
  type ConnectionSnapshot,
  type ReadyMessage,
} from "@powertools/sdk/protocol";

import type { LoadedCommunityTool } from "../../platform/desktopBridge";
import { useConnection, useOpenInBrowser, useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { Button, EmptyState, Modal, ToastProvider, useToast } from "../../shared/ui";
import { ShellShortcutDispatchContext } from "../keyboard/useShellShortcuts";
import { createBroker } from "./broker";
import { createHostServices } from "./hostServices";
import { FORWARDED_SHORTCUTS, readThemeSnapshot } from "./themeSnapshot";

const HANDSHAKE_TIMEOUT_MS = 10_000;

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

function snapshotOf(info: { displayName: string; crmType: ConnectionSnapshot["kind"] } | null): ConnectionSnapshot | null {
  return info ? { displayName: info.displayName, kind: info.crmType } : null;
}

type Broker = ReturnType<typeof createBroker>;

function isHello(data: unknown): data is { type: "hello"; protocolVersion: number } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "hello" &&
    typeof (data as { protocolVersion?: unknown }).protocolVersion === "number"
  );
}

export function CommunityToolFrame({ tool }: { tool: LoadedCommunityTool }) {
  const manifest = tool.manifest;
  if (!manifest) {
    return <EmptyState title="This tool did not start" description="Its manifest could not be read." />;
  }
  // Built-in tools each bring their own toast provider; the shell supplies none, so the frame does.
  return (
    <ToastProvider>
      <ManifestFrame manifest={manifest} />
    </ToastProvider>
  );
}

function ManifestFrame({
  manifest,
}: {
  manifest: NonNullable<LoadedCommunityTool["manifest"]>;
}) {
  const { connectionId } = useTabConnection();
  const connection = useConnection(connectionId);
  const toast = useToast();
  const openInBrowser = useOpenInBrowser();
  const shellDispatch = useContext(ShellShortcutDispatchContext);

  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const brokerRef = useRef<Broker | null>(null);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const startedAtRef = useRef(0);
  const loadedRef = useRef(false);
  const pendingConfirmRef = useRef<PendingConfirm | null>(null);

  // The services outlive renders, so they read the latest values through refs.
  const live = useRef({ connection, toast, openInBrowser, shellDispatch });
  live.current = { connection, toast, openInBrowser, shellDispatch };

  useToolStatus(status === null || status === "" ? null : status);

  const requestConfirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      pendingConfirmRef.current?.resolve(false);
      const next = { options, resolve };
      pendingConfirmRef.current = next;
      setPendingConfirm(next);
    });
  }, []);

  const answerConfirm = useCallback((confirmed: boolean) => {
    const current = pendingConfirmRef.current;
    if (!current) return;
    pendingConfirmRef.current = null;
    setPendingConfirm(null);
    current.resolve(confirmed);
  }, []);

  const services = useMemo(
    () =>
      createHostServices({
        toolId: manifest.id,
        toolName: manifest.name,
        getConnection: () => live.current.connection,
        openInBrowser: (url) => live.current.openInBrowser(url),
        toast: { showToast: (message, type) => live.current.toast.showToast(message, type) },
        setStatus,
        requestConfirm,
        dispatchShortcut: (keys) => live.current.shellDispatch?.(keys),
      }),
    [manifest.id, manifest.name, requestConfirm],
  );

  // Starts the handshake clock and the timeout whenever a fresh frame is mounted.
  useEffect(() => {
    startedAtRef.current = performance.now();
    loadedRef.current = false;
    const timer = setTimeout(() => {
      if (!brokerRef.current) fail();
    }, HANDSHAKE_TIMEOUT_MS);

    function fail() {
      sessionCleanupRef.current?.();
      setFailed(true);
    }

    return () => {
      clearTimeout(timer);
      sessionCleanupRef.current?.();
    };
  }, [attempt]);

  const onFrameLoad = () => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    // Only the first load of a mounted frame gets a port. A later load means the frame navigated
    // or reloaded itself, so whatever page is there now must not receive the tool's permissions.
    if (loadedRef.current) {
      sessionCleanupRef.current?.();
      setStatus(null);
      setFailed(true);
      return;
    }
    loadedRef.current = true;

    const channel = new MessageChannel();
    const port = channel.port1;
    let session: Broker | null = null;

    const cleanup = () => {
      session?.dispose();
      session = null;
      brokerRef.current = null;
      port.onmessage = null;
      port.close();
      sessionCleanupRef.current = null;
    };
    sessionCleanupRef.current = cleanup;

    port.onmessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (!isHello(data)) return;
      if (data.protocolVersion !== PROTOCOL_VERSION) {
        cleanup();
        setFailed(true);
        return;
      }
      const ready: ReadyMessage = {
        type: "ready",
        protocolVersion: PROTOCOL_VERSION,
        theme: readThemeSnapshot(),
        connection: snapshotOf(live.current.connection),
        shortcuts: FORWARDED_SHORTCUTS,
      };
      port.postMessage(ready);
      session = createBroker({ manifest, port, services });
      brokerRef.current = session;
      console.info(
        `[community-tool] ${manifest.id} handshake after ${Math.round(performance.now() - startedAtRef.current)} ms`,
      );
    };

    // The frame's origin is opaque, so "*" is the only target origin that reaches it. The message
    // carries no secret and the port only speaks the permission-checked protocol.
    target.postMessage({ type: CONNECT_MESSAGE }, "*", [channel.port2]);
  };

  // Follow theme changes on <html data-theme>.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      brokerRef.current?.notifyTheme(readThemeSnapshot());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const connectionKey = connection ? `${connection.displayName}|${connection.crmType}` : "";
  useEffect(() => {
    brokerRef.current?.notifyConnection(snapshotOf(live.current.connection));
  }, [connectionKey]);

  // An open confirmation must not outlive the frame.
  useEffect(
    () => () => {
      pendingConfirmRef.current?.resolve(false);
      pendingConfirmRef.current = null;
    },
    [],
  );

  if (failed) {
    return (
      <EmptyState
        title="This tool did not start"
        description={`${manifest.name} did not respond. Reload to try again.`}
        action={
          <Button
            onClick={() => {
              setFailed(false);
              setStatus(null);
              setAttempt((value) => value + 1);
            }}
          >
            Reload
          </Button>
        }
      />
    );
  }

  return (
    <>
      <iframe
        key={attempt}
        ref={iframeRef}
        title={manifest.name}
        sandbox="allow-scripts"
        src={`pt-tool://${manifest.id}/${manifest.entry}`}
        onLoad={onFrameLoad}
        className="h-full w-full border-0 bg-canvas"
      />
      <Modal
        open={pendingConfirm !== null}
        title={pendingConfirm?.options.title ?? ""}
        onClose={() => answerConfirm(false)}
        widthClass="max-w-md"
      >
        <p className="whitespace-pre-wrap text-sm text-fg">{pendingConfirm?.options.message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => answerConfirm(false)}>
            Cancel
          </Button>
          <Button onClick={() => answerConfirm(true)}>{pendingConfirm?.options.confirmLabel}</Button>
        </div>
      </Modal>
    </>
  );
}
