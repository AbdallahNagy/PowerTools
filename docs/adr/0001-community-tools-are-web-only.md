# Community tools are web-only

Status: accepted, 2026-11-11

## Context

Power Tools lets people outside this repository add tools. Built-in tools pair a React UI with C# endpoints in the sidecar, which holds the Dataverse connection. Anything that runs in the sidecar or the main process runs with the user's Dataverse access and local file access, and a third party's code there cannot be contained.

## Decision

A **Community tool** is web-only. It is a folder of HTML, JavaScript, and CSS that runs in a sandboxed frame and reaches Dataverse and the desktop only through the SDK and the **Broker**, which enforces the **Tool permissions** in its **Tool manifest**. The community ships no C#, and no community code runs in the sidecar or the main process. The sidecar offers one generic Dataverse API that does not know which tool is calling.

## Alternatives rejected

- **Community C# in the sidecar.** It would give tools the full .NET Dataverse SDK, but it runs arbitrary code outside any sandbox, with the user's Dataverse access, and needs a build, signing, and loading story for assemblies.
- **Native modules or Node access in the tool's frame.** Same trust problem in a different place.

## Consequences

- A tool that needs .NET-only work becomes a new host capability, added to the generic API and the SDK, or it stays a built-in tool.
- Isolation rests on the sandboxed frame, the Content Security Policy on every file the `pt-tool` scheme serves, and the Broker, not on review of tool code.
- Tool authors need only web skills, and tools can be written and checked by coding agents against the SDK.
- The network rule does not cover WebRTC. A tool's `network` list becomes the `connect-src` directive, which Chromium does not apply to `RTCPeerConnection`. On Electron 39 a sandboxed tool with no network hosts can still reach STUN and TURN servers, over UDP and over TCP, and a TURN server can relay data out. No policy, switch, or setting we tried stops it (see "WebRTC check" in the community tool runtime design spec). The consent screen therefore must not promise that a tool with no network hosts cannot send data out. The gap applies to every tool, whether or not it comes from the registry, so users should treat any tool as able to send out what it can read.
