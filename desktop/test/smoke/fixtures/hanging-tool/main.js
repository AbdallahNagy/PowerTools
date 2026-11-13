// Completes the handshake by hand, without the SDK, then blocks the frame's thread.
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (!event.data || event.data.type !== "pt-tool:connect" || event.ports.length !== 1) return;
  const port = event.ports[0];
  port.onmessage = (reply) => {
    if (reply.data && reply.data.type === "ready") {
      setTimeout(() => {
        while (true) {}
      }, 1000);
    }
  };
  port.postMessage({ type: "hello", protocolVersion: 1 });
});
