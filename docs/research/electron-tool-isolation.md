# Electron isolation for community tool UIs and tool workers

Research for [#97](https://github.com/AbdallahNagy/PowerTools/issues/97), part of the "Community tools v1" map ([#95](https://github.com/AbdallahNagy/PowerTools/issues/95)).

**Question.** Which Electron isolation technique fits a community tool's untrusted web UI and its tool workers? The candidates are a sandboxed iframe on a custom protocol, `<webview>`, and `WebContentsView` with its own session or partition. For workers, the candidates are a Web Worker inside the sandbox and `utilityProcess`. Each one is judged on Electron's security guidance, how the Host API crosses the boundary, CSP and network control, and fit as a tab in the current shell.

Vocabulary follows `GLOSSARY.md`. A **community tool** is third-party code that "runs sandboxed and reaches Dataverse and the desktop only through the **Host API**". A **tool worker** is a "script a community tool ships to run outside its tab's page, still sandboxed and limited to the Host API".

Researched 2026-11-03. Labels used below:
- **Observed**: stated in a cited source or seen in this repo.
- **Inference**: reasoned from observed facts but not tested.
- **Recommendation**: a proposal.

## Versions and scope

- **Observed.** `desktop/package.json` asks for `electron ^39.1.1`, and `desktop/package-lock.json` pins **39.1.1**.
- **Observed.** Electron 39.1.1 ships Chromium 142.0.7444.59, Node 22.21.1 and V8 14.2 ([release page](https://releases.electronjs.org/release/v39.1.1)).
- **Version caveat.** Electron's docs site serves `/docs/latest/`, which is newer than 39. Every API cited here exists in 39: `WebContentsView` replaced `BrowserView` in Electron 30, and `protocol.handle`, `utilityProcess` and `will-frame-navigate` are older still. Claims about Electron and Chromium internals were checked against source pinned to the `v39.1.1` and `142.0.7444.59` tags.
- **Not covered.** Packaging, signing and distributing community tools, and the shape of the Host API itself. Nothing here was prototyped.

## What the current shell looks like

All observed in this repo:

- **One window, one renderer.** `desktop/src/electron/main.ts` creates one frameless `BrowserWindow` whose only web preference is `preload`. That leaves Electron's defaults: `contextIsolation: true`, `sandbox: true` (the default since Electron 20), `nodeIntegration: false` and `webviewTag: false` ([WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)). The packaged app loads `dist-react/index.html` from `file://`.
- **The renderer holds secrets.** `preloadApi.cts` exposes `getLocalSecret`, `getActiveConnection` and `refreshToken`. `desktop/src/ui/shared/api/client.ts` caches the sidecar URL, the per-launch sidecar secret and Dataverse access tokens in renderer memory. Community tool code must therefore never run in the shell's own JavaScript context or origin.
- **IPC handlers don't check who is calling.** The handlers in `main.ts` (`get-api-base-url`, `get-local-secret`, …) and in `connectionIpc.ts` do not validate `event.senderFrame`. `desktop/src/electron/AGENTS.md` already requires "Validate IPC senders and inputs before privileged operations".
- **The shell CSP blocks frames.** `desktop/contentSecurityPolicy.ts` sets `frame-src 'none'`, `worker-src 'self' blob:`, and `connect-src 'self' http://127.0.0.1:*`. It is delivered as a `<meta>` tag.
- **Hidden tabs stay mounted.** `desktop/src/ui/shell/tabs/TabBar.tsx` renders every open tab and hides inactive ones with the `hidden` class (`display: none`). They are not unmounted. `ToolHost.tsx` mounts a built-in tool's React component directly inside the shell DOM.
- **Shortcuts and overlays live in the shell document.** Shell shortcuts use `document.addEventListener("keydown")` in `useShellShortcuts.ts`. The command palette, context menus and dialogs are DOM overlays rendered by the shell (`desktop/src/ui/shell/layout/`).

## Electron's guidance that applies to every option

From the [security checklist](https://www.electronjs.org/docs/latest/tutorial/security) (observed):

| Item | Guidance | Bearing on community tools |
|---|---|---|
| 4 | "You should enable the sandbox in all renderers." | Already the default. |
| 5 | Electron "will automatically approve all permission requests" unless a handler is set. Use `setPermissionRequestHandler` in every session that loads remote content. | Deny by default for tool origins. |
| 7 | Define a CSP. It can be sent as a header through `webRequest.onHeadersReceived`, and a header can't be used with `file://`. | |
| 13, 14 | Limit navigation and new windows (`will-navigate`, `setWindowOpenHandler`). | |
| 17 | "All Web Frames can in theory send IPC messages to the main process, including iframes and child windows." | Validate `sender` on every handler. |
| 18 | Serve local pages from a custom protocol instead of `file://`, which has "unilateral access to every file on your machine". | |
| 20 | "You should not directly expose Electron's APIs, especially IPC, to untrusted web content." | |

Further observed facts:

- **Sandboxed renderers have no Node.** They have no Node.js environment, and a sandboxed preload can `require` only the `electron` module ([sandbox tutorial](https://www.electronjs.org/docs/latest/tutorial/sandbox)).
- **Electron is less hardened than Chrome.** The same page says Electron "cannot be as secure as Chromium" (no Safe Browsing, for example) and that the best defence is staying on the latest stable version.
- **`ipcMain` hears every renderer.** Each `IpcMainInvokeEvent` carries `sender` and `senderFrame` ([IpcMainInvokeEvent](https://www.electronjs.org/docs/latest/api/structures/ipc-main-invoke-event)). `webContents.ipc` is "an `IpcMain` scoped to just IPC messages sent from this WebContents", and its handlers take precedence over the global `ipcMain` ([webContents](https://www.electronjs.org/docs/latest/api/web-contents)).

**Inference (applies to every option).** A community tool UI is untrusted code in a Chromium renderer. If an exploit takes over that renderer process, it can speak Electron's IPC directly, whether or not a preload exposed anything. The existing unchecked `get-local-secret` and `get-active-connection` handlers would hand it the sidecar secret and a Dataverse token. So whichever option is chosen, community tools must not ship until every privileged `ipcMain` handler accepts only the shell's own frames. One way to do this is to register the shell's handlers on `mainWindow.webContents.ipc` and check `senderFrame` against the shell's main frame and origin.

## Option A: sandboxed iframe on a custom protocol

**How it works.** The tool bundle is served from a privileged custom scheme, for example `pt-tool://<tool-id>/index.html`, through `protocol.handle`. The shell's React tab renders an `<iframe sandbox="allow-scripts" src="pt-tool://…">`.

**Security, observed:**
- **The `sandbox` attribute.** With no tokens it applies every restriction. Without `allow-same-origin`, the frame is "treated as being from a special origin that always fails the same-origin policy" ([MDN `<iframe>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)). MDN strongly discourages `allow-scripts` plus `allow-same-origin` only when the embedded document is *same-origin with the embedder*, because the frame could then remove its own sandbox. A per-tool custom-scheme origin is never same-origin with the shell.
- **The iframe gets its own process.** Electron forces strict site isolation: `ElectronBrowserClient::ShouldEnableStrictSiteIsolation()` returns `true` ([source, v39.1.1](https://github.com/electron/electron/blob/v39.1.1/shell/browser/electron_browser_client.cc)). Chromium 142 also turns on `kIsolateSandboxedIframes` by default. Its source comment reads: "only iframes with origin-restricted sandboxes are isolated". Those iframes are grouped per origin ([blink features.cc @142.0.7444.59](https://chromium.googlesource.com/chromium/src/+/refs/tags/142.0.7444.59/third_party/blink/common/features.cc); policy check in [site_isolation_policy.cc](https://chromium.googlesource.com/chromium/src/+/refs/tags/142.0.7444.59/content/public/browser/site_isolation_policy.cc)). An iframe sandboxed without `allow-same-origin` therefore runs in a renderer process separate from the shell, which holds the secrets.
- **The iframe gets no preload.** The shell's preload, and therefore `window.electron`, runs only in the main frame. Sub-frames get Node or preload only through the "experimental" `nodeIntegrationInSubFrames` option ([WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)), which must stay off.
- **Electron recommends this route.** The [web embeds guide](https://www.electronjs.org/docs/latest/tutorial/web-embeds) names iframes as a preferred alternative to `<webview>`, and its only security advice for iframes is to use `sandbox` and allow only what is needed.

**Security, inference:**
- If `allow-same-origin` is granted, so the tool keeps a real `pt-tool://<id>` origin, the iframe no longer has an "origin-restricted sandbox", and `kIsolateSandboxedIframes` stops applying. It then depends on strict site isolation treating `pt-tool://<id>` and the shell's `file://` as different sites, which is likely but untested.
- The iframe shares the shell's session (the default session): cache, permission handlers, protocol handlers and `webRequest` listeners.

**Host API crossing:**
- **Observed.** `window.postMessage` and `MessagePort` work across the opaque-origin boundary. Ports can be transferred.
- **Observed.** Electron's main process can create a `MessageChannelMain` and send one end to the shell with `webContents.postMessage(channel, msg, [port])`. In the renderer the port arrives as a DOM `MessagePort`. A context-isolated preload can forward it into the page with `window.postMessage(…, [port])` ([MessagePorts tutorial](https://www.electronjs.org/docs/latest/tutorial/message-ports); [webContents.postMessage](https://www.electronjs.org/docs/latest/api/web-contents)).
- **Recommendation.** The shell transfers that port, not one it created itself, into the iframe during a handshake, checking `event.source === iframe.contentWindow`. Each tool frame then talks straight to the main process over its own `MessagePortMain`. Main knows which tool owns each port and enforces Host API permissions there. Shell renderer JS never sits on the path and never needs to relay tokens.
- **Observed.** The sandboxed frame's `origin` is `"null"`, so the shell must use target origin `"*"` and identify the frame by `event.source`, never by `event.origin`.

**CSP and network control:**
- **Observed.** `protocol.handle` returns a `Response` with headers ([protocol](https://www.electronjs.org/docs/latest/api/protocol)). Each tool document can therefore carry a host-written `Content-Security-Policy` header that the tool can't loosen, for example `default-src 'self'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'`.
- **Observed.** The header can also include the CSP `sandbox` directive. That directive is "not supported in the `<meta>` element", so it must be a header, and it sandboxes the document even if it ends up somewhere other than the shell's iframe ([MDN CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)).
- **Observed.** Privileged-scheme options include `standard`, `secure`, `supportFetchAPI` and `bypassCSP`. A non-standard scheme gets no web storage. A protocol is registered per session ([protocol](https://www.electronjs.org/docs/latest/api/protocol)). **Recommendation:** never set `bypassCSP` for the tool scheme.
- **Observed.** As a backstop, `session.webRequest.onBeforeRequest` can cancel requests, and its `details` include `frame` and `webContents` ([webRequest](https://www.electronjs.org/docs/latest/api/web-request)). Only "the last attached `listener` will be used", so the shell needs one listener that covers both itself and tools.
- **Observed.** `will-frame-navigate` "is fired when the main frame or any of its subframes attempts to navigate", so tool frames can be pinned to their own origin ([webContents](https://www.electronjs.org/docs/latest/api/web-contents)).
- **Change needed.** The shell CSP must change `frame-src 'none'` to `frame-src pt-tool:`.

**Fit as a tab: best of the three.**
- **Inference.** The iframe is ordinary DOM inside the existing `TabBar` and `ToolHost` layout. Layout, resize and `display: none` for hidden tabs come free. Shell overlays (command palette, Radix dialogs, context menus) paint above it as they do today.
- **Inference, costs:**
  - Keystrokes inside the iframe don't reach the shell's `document` `keydown` listener, so shell shortcuts need a forwarding message in the Host API.
  - Theme tokens must be pushed to the tool, because CSS custom properties don't cross documents.
  - An opaque origin has no `localStorage` or IndexedDB, so tool settings need a Host API storage call, or the frame is given `allow-same-origin` with a per-tool origin.

## Option B: `<webview>`

**Security, observed:**
- Electron recommends against it: "We currently recommend to not use the `webview` tag and to consider alternatives, like `iframe`, a `WebContentsView`, or an architecture that avoids embedded content altogether." The stated reason is that it is "undergoing dramatic architectural changes" that affect "rendering, navigation, and event routing" ([webview tag](https://www.electronjs.org/docs/latest/api/webview-tag)).
- The web embeds guide adds: "We do not guarantee that the WebView API will remain available in future versions of Electron" ([web embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds)).
- It requires `webviewTag: true` on the shell window. Checklist item 12 then asks for a `will-attach-webview` handler that strips `preload`, forces `nodeIntegration: false` and rejects unexpected `src` values, because page script can create `<webview>` elements.

**Host API crossing, observed.** The guest gets a `preload` (a `file:` URL) and replies with `ipcRenderer.sendToHost`. The host element receives `ipc-message`, and the host sends with `webview.send` ([webview tag](https://www.electronjs.org/docs/latest/api/webview-tag)). The `partition` attribute gives the guest its own session.

**CSP and network control.** The same as Option C, because the guest has its own session and can have its own `webRequest` and protocol handlers.

**Fit as a tab.** It is a DOM element, so it fits like an iframe. It is an out-of-process iframe internally.

**Verdict: reject.** It fits a tab no better than the iframe, and Electron says it may change or disappear. Enabling `webviewTag` also widens what the shell renderer can do.

## Option C: `WebContentsView` with its own partition

**How it works.** The main process creates `new WebContentsView({ webPreferences: { partition: 'tool:<id>', sandbox: true, contextIsolation: true, preload: <minimal port receiver> } })`, adds it with `win.contentView.addChildView(view)`, and positions it with `setBounds`. Observed sources: [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [View](https://www.electronjs.org/docs/latest/api/view), and the BrowserView-to-WebContentsView [migration post](https://www.electronjs.org/blog/migrate-to-webcontentsview) ("deprecated since Electron 30").

**Security: strongest of the three.**
- **Observed.** The tool gets its own `WebContents`, so its own renderer process, and its own `Session`. A partition without the `persist:` prefix uses "an in-memory session" ([session](https://www.electronjs.org/docs/latest/api/session)).
- **Observed.** Protocol handlers, `webRequest`, permission handlers, `will-download` and storage are all per session. The tool scheme can be registered only in the tool's session, and the shell's session never serves tool content ([protocol](https://www.electronjs.org/docs/latest/api/protocol)).
- **Inference.** No shared cache or cookie jar with the shell. Uninstalling a tool can call `ses.clearStorageData()`.

**Host API crossing:**
- **Observed.** Main sends a `MessagePortMain` with `view.webContents.postMessage('host-api', null, [port])`. A sandboxed preload of about ten lines forwards it into the main world ([MessagePorts tutorial](https://www.electronjs.org/docs/latest/tutorial/message-ports)).
- **Recommendation.** Expose nothing else through `contextBridge`. Any `ipcMain` handler the tool could reach must check `sender`.

**CSP and network control: cleanest of the three.** Observed facts:
- A per-session `onHeadersReceived` or the protocol handler sets CSP.
- A per-session `onBeforeRequest` can cancel everything that isn't `pt-tool:`.
- `setPermissionRequestHandler`, `setPermissionCheckHandler` and `setDevicePermissionHandler` can deny everything.
- `will-download` can `preventDefault()`.

**Fit as a tab: poor.**
- **Observed.** The view is "not part of the DOM", and aligning it with DOM content "requires coordination between the main and renderer processes" ([web embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds)).
- **Inference, costs:**
  - **Bounds.** The shell must report the tab body's rectangle (`ResizeObserver` over IPC) on every layout change, including sidebar collapse, panel resize and window resize.
  - **Hidden tabs.** Tab switching must call `setVisible(false)` instead of relying on `display: none`.
  - **Overlays.** A native child view paints above the shell's web contents, so the command palette, Radix dialogs, toasts and context menus would be hidden behind an open tool. The shell would have to hide or shrink the view while any overlay is open. This is untested and the docs don't state the z-order explicitly. A one-hour prototype could confirm it.
  - **Focus and shortcuts** need explicit main-process handling, for example `before-input-event` on the view's `webContents`.

## Tool workers

### Web Worker inside the tool's sandbox

- **Observed.** The worker script URL "must be same-origin with the caller's document, or a `blob:` or `data:` URL". A `blob:` URL "inherits the origin of the document that created it", so a CSP must allow `blob:` in `worker-src` ([MDN Worker()](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)).
- **Inference.** In an opaque-origin iframe (Option A without `allow-same-origin`), `new Worker('pt-tool://<id>/worker.js')` will likely fail the same-origin check. The tool would have to build a `blob:` worker from source it already has. With a per-tool origin (Option A with `allow-same-origin`, or Option C) a plain same-origin worker URL works. Test this in the prototype.
- **Inference.** A dedicated worker runs in the same sandboxed renderer as its document and inherits the same network limits. It can receive a `MessagePort` transferred from the page, so it can use the Host API port. It stops when the document goes away, so closing the tab ends it.
- **Fit.** No new process or lifecycle machinery. It fits as long as tool workers may live and die with their tab.

### `utilityProcess`: reject for tool code

- **Observed.** "The utility process runs in a Node.js environment" ([process model](https://www.electronjs.org/docs/latest/tutorial/process-model)).
- **Observed.** Electron's `NodeService` Mojo interface, which backs `utilityProcess.fork`, is declared `[ServiceSandbox=sandbox.mojom.Sandbox.kNoSandbox]` ([node_service.mojom @ v39.1.1](https://github.com/electron/electron/blob/v39.1.1/shell/services/node/public/mojom/node_service.mojom)). The launch code sets no other sandbox type ([electron_api_utility_process.cc](https://github.com/electron/electron/blob/v39.1.1/shell/browser/api/electron_api_utility_process.cc)). The `utilityProcess` API page never calls it a sandbox ([utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)).
- **Observed.** Running tool code inside it through `node:vm` doesn't fix this: "The `node:vm` module is not a security mechanism. Do not use it to run untrusted code" ([Node 22 vm](https://nodejs.org/docs/latest-v22.x/api/vm.html)).
- **Conflict between sources.** The process-model page lists "untrusted services" as an example use. In the same paragraph it says the process runs Node, and the source shows no OS sandbox. That example cannot outweigh the project rule against native Node code from tools.
- **Verdict.** Tool scripts in `utilityProcess` would have full Node and OS access, which breaks the Glossary's "still sandboxed and limited to the Host API". It stays suitable for *host* code that Power Tools itself writes.

### Option the ticket did not list: a hidden sandboxed renderer per tool

- **Observed.** Electron's MessagePorts tutorial documents a "worker window": a hidden `BrowserWindow` (`show: false`) with a full Blink context, connected to other renderers over `MessageChannelMain` ([MessagePorts tutorial](https://www.electronjs.org/docs/latest/tutorial/message-ports)).
- **Observed.** `backgroundThrottling` (default `true`) throttles timers in background pages ([WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)).
- **Inference.** Given the tool's partition, `sandbox: true` and only the Host API port, this is a tool worker that outlives its tab and keeps Chromium's renderer sandbox. It can host Web Workers of its own.
- **Costs.** One extra renderer process per running tool worker. Main must manage its lifecycle and watch `render-process-gone`.

## Recommendation

1. **Tool UI: Option A, a sandboxed iframe served from a privileged custom scheme.** It is the only option that fits the current React tab shell without fighting overlays, focus and layout. Electron's own guidance points to it ahead of `<webview>`. In Electron 39 / Chromium 142 a sandboxed frame without `allow-same-origin` gets its own renderer process. Conditions:
   - The host writes the CSP as a response header, including the `sandbox` directive.
   - `connect-src 'none'`. Dataverse and the desktop are reachable only through the Host API.
   - The Host API runs over a `MessagePortMain` from the main process, so the main process, not shell JS, enforces permissions.
   - One `webRequest` backstop, deny-by-default permission handlers, and `will-frame-navigate` limits.
   - Sender validation on every existing `ipcMain` handler (see "Electron's guidance that applies to every option").
2. **Fallback: Option C, `WebContentsView` with a per-tool partition.** Use it if the prototype shows that a tool iframe shares the shell's process, or if a separate session turns out to be required, for example per-tool storage isolation or network rules that can't be expressed per frame. It has the strongest isolation and the worst tab fit.
3. **Do not use `<webview>`.**
4. **Tool workers: a dedicated Web Worker inside the tool's sandbox for v1.** Same CSP, same Host API port, no new lifecycle. If tool workers must outlive their tab, use a hidden sandboxed renderer per tool on the tool's partition. The Glossary's "run outside its tab's page" can be read either way, so decide this first. **Never run tool code in `utilityProcess`.**

## Open questions that could change the recommendation

1. **Process isolation of the tool iframe, both ways.** Does an `allow-scripts` iframe on `pt-tool://<id>` actually get its own process in the packaged app? Check with `app.getAppMetrics()` or Task Manager, with and without `allow-same-origin`. If either variant shares the shell's process, Option A fails for that variant.
2. **Tool worker lifetime.** Must tool workers outlive the tab? That decides between a Web Worker and a hidden renderer.
3. **Origin model.** Should tools get a stable per-tool origin (`allow-same-origin` with a standard `pt-tool://<id>` scheme) for storage and plain worker URLs, or an opaque origin with all storage behind the Host API? Opaque is safer but less convenient.
4. **Data leaving without a network request.** CSP and `webRequest` cover HTTP fetches. WebRTC, DNS prefetch and other channels that bypass `connect-src` were not checked against Chromium 142. Verify with the permission handler and `webContents.setWebRTCIPHandlingPolicy` before calling the network locked down.
5. **Serving the shell from a custom scheme.** The shell still loads from `file://`, against checklist item 18. Moving it to its own custom scheme would simplify origin checks for both the shell and tools. That is a separate decision outside this ticket.
6. **`WebContentsView` overlay behaviour.** The z-order cost of Option C is inferred, not documented. Prototype it before choosing Option C.
