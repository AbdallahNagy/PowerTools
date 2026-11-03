// PROTOTYPE (wayfinder spike, issue #101). Throwaway: never merge to main.
// Frames the local "hello-tool" bundle in a sandboxed iframe on pt-tool:// and
// hands it the Host API MessagePort that the main process creates for this tab.
import { useEffect, useRef, useState } from "react";
import { useToolRuntime } from "../../shell/tool-runtime/useToolRuntime";
import { Button, Modal } from "../../shared/ui";

interface FrameInfo {
  url: string;
  origin: string;
  osProcessId: number;
  isShell: boolean;
}

declare global {
  interface Window {
    prototypeTools: {
      open(toolId: string, instanceId: string, connectionId: string | null): Promise<boolean>;
      frames(): Promise<FrameInfo[]>;
    };
  }
}

const TOOL_ID = "hello-tool";

export default function CommunityToolSpike() {
  const { instanceId, connectionId } = useToolRuntime();
  const [sameOrigin, setSameOrigin] = useState(false);
  const [frames, setFrames] = useState<FrameInfo[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const note = (line: string) => setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} ${line}`]);

  useEffect(() => {
    function onPort(event: MessageEvent) {
      if (event.source !== window || event.data?.type !== "prototype-tool-port") return;
      if (event.data.instanceId !== instanceId) return;
      const port = event.ports[0];
      // An opaque-origin frame cannot be targeted by origin, hence "*".
      iframeRef.current?.contentWindow?.postMessage({ type: "host-api-port" }, "*", [port]);
      note("Host API port handed to the tool frame");
    }
    window.addEventListener("message", onPort);
    return () => window.removeEventListener("message", onPort);
  }, [instanceId]);

  async function onFrameLoad() {
    note(`Frame loaded (sandbox: allow-scripts${sameOrigin ? " allow-same-origin" : ""})`);
    await window.prototypeTools.open(TOOL_ID, instanceId, connectionId);
    setFrames(await window.prototypeTools.frames());
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <strong>PROTOTYPE: community tool spike</strong>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={sameOrigin} onChange={(e) => setSameOrigin(e.target.checked)} />
          allow-same-origin
        </label>
        <Button size="sm" onClick={async () => setFrames(await window.prototypeTools.frames())}>Refresh processes</Button>
        <Button size="sm" onClick={() => setDialogOpen(true)}>Open shell dialog over tool</Button>
        <span>connection: {connectionId ?? "none"}</span>
      </div>
      <table className="text-xs">
        <tbody>
          {frames.map((f, i) => (
            <tr key={i}>
              <td className="pr-3">{f.isShell ? "shell" : "frame"}</td>
              <td className="pr-3">pid {f.osProcessId}</td>
              <td className="pr-3">origin {f.origin}</td>
              <td>{f.url}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <iframe
        key={String(sameOrigin)}
        ref={iframeRef}
        title="Community tool"
        src={`pt-tool://${TOOL_ID}/index.html${sameOrigin ? "?so=1" : ""}`}
        sandbox={sameOrigin ? "allow-scripts allow-same-origin" : "allow-scripts"}
        onLoad={onFrameLoad}
        className="min-h-0 flex-1 border border-[var(--color-border)]"
      />
      <pre className="max-h-24 overflow-auto text-xs">{log.join("\n")}</pre>
      <Modal open={dialogOpen} title="Shell dialog" onClose={() => setDialogOpen(false)}>
        <p className="p-4">If you can read this above the tool frame, shell overlays paint over it.</p>
      </Modal>
    </div>
  );
}
