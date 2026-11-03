// PROTOTYPE community tool. Probes the sandbox and calls the Host API.
const results = {};
function record(name, ok, detail) {
  results[name] = { ok, detail };
  const row = document.createElement("tr");
  row.innerHTML = `<td class="${ok ? "ok" : "fail"}">${ok ? "OK" : "NO"}</td><td>${name}</td><td></td>`;
  row.lastChild.textContent = typeof detail === "string" ? detail : JSON.stringify(detail);
  document.getElementById("results").appendChild(row);
  console.log("[hello-tool]", name, ok, detail);
}
window.__results = results;

record("frame origin", true, `self.origin=${self.origin} location=${location.href}`);

// Host API: a minimal request/response over the MessagePort the shell hands us.
let hostPort = null;
let nextId = 1;
const pending = new Map();
function hostRequest(method, path) {
  if (!hostPort) return Promise.reject(new Error("No Host API port yet."));
  const id = nextId++;
  hostPort.postMessage({ id, method, path });
  return new Promise((resolve) => pending.set(id, resolve));
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.type !== "host-api-port") return;
  hostPort = event.ports[0];
  hostPort.onmessage = ({ data }) => {
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  };
  record("host api port received", true, "MessagePort from shell");
  callWhoAmI();
});

async function callWhoAmI() {
  const res = await hostRequest("GET", "WhoAmI");
  record("host api WhoAmI", !!res.ok, res.ok ? { UserId: res.body.UserId, OrganizationId: res.body.OrganizationId } : res.error ?? res.status);
}
document.getElementById("whoami").onclick = callWhoAmI;
document.getElementById("accounts").onclick = async () => {
  const res = await hostRequest("GET", "accounts?$select=name&$top=3");
  document.getElementById("body").textContent = JSON.stringify(res, null, 2);
};

// The CSP should stop direct network access, with or without a token.
fetch("https://example.com/")
  .then(() => record("direct fetch blocked", false, "fetch to example.com succeeded"))
  .catch((e) => record("direct fetch blocked", true, String(e)));

// Workers: a plain URL, then a blob: worker with inline source.
try {
  const w = new Worker("worker.js");
  w.onmessage = ({ data }) => record("plain URL worker", true, data);
  w.onerror = (e) => { e.preventDefault(); record("plain URL worker", false, e.message || "error event"); };
} catch (e) {
  record("plain URL worker", false, String(e));
}

try {
  const source = `
    self.onmessage = async ({ data, ports }) => {
      ports[0].postMessage({ kind: "blob-worker", origin: self.origin, echo: data });
      try { await fetch("https://example.com/"); ports[0].postMessage({ kind: "worker-fetch", blocked: false }); }
      catch (e) { ports[0].postMessage({ kind: "worker-fetch", blocked: true, error: String(e) }); }
    };`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const w = new Worker(url);
  const channel = new MessageChannel();
  channel.port1.onmessage = ({ data }) => {
    if (data.kind === "blob-worker") record("blob: worker + transferred port", true, data);
    else record("worker direct fetch blocked", data.blocked, data.error ?? "worker fetch succeeded");
  };
  w.onerror = (e) => { e.preventDefault(); record("blob: worker + transferred port", false, e.message || "error event"); };
  w.postMessage("ping", [channel.port2]);
} catch (e) {
  record("blob: worker + transferred port", false, String(e));
}
