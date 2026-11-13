# Power Tools

A Windows desktop toolbox for Dataverse and Power Platform. It hosts tools that work against the user's Dataverse connections.

## Language

**Built-in tool**:
A tool that ships inside Power Tools and is maintained in this repository.
_Avoid_: Core tool, native tool

**Community tool**:
A tool built outside this repository that runs in a sandboxed frame and reaches Dataverse only through the SDK.
_Avoid_: Plugin, extension, add-in

**Tool manifest**:
The `powertools-tool.json` file at the root of a **Community tool** package. It names the tool and declares its **Tool permissions**, the Dataverse messages it may execute, and the network hosts it may call.
_Avoid_: Config, package file

**Tool permission**:
One entry of a fixed list in a **Tool manifest** (for example `data:read` or `metadata:write`) that allows a **Community tool** a class of operations. The **Broker** enforces it, and the user consents to the full set.
_Avoid_: Scope, role, capability

**Broker**:
The shell module that sits between a **Community tool**'s frame and the app. It checks every request against the tool's **Tool permissions**, runs it, and replies; it is the only place permissions are enforced.
_Avoid_: Proxy, gateway, bridge

**Reference tool**:
Attribute Explorer rebuilt as a **Community tool** in `packages/reference-tool`. It is the runtime's test fixture and the example for tool authors.
_Avoid_: Sample tool, demo tool

**Host API**:
The interface Power Tools offers a **Community tool** for everything outside its sandbox.
_Avoid_: Bridge, toolbox API

**Tool worker**:
Script a **Community tool** ships to run outside its tab's page, still sandboxed and limited to the **Host API**.
_Avoid_: Backend, service

**Catalog**:
The list of **Community tools** a user can browse, install and update from inside Power Tools.
_Avoid_: Store, marketplace, gallery

**Theme token**:
A named, role-based colour of the Power Tools theme, with a value for light and for dark, that **Built-in tools** and **Community tools** both style with.
_Avoid_: Palette variable, CSS var

**Community UI kit**:
The optional set of framework-neutral controls a **Community tool** may use to look like Power Tools, styled only through **Theme tokens**.
_Avoid_: Component library, design system

**Agent tool**:
An operation the Power Tools MCP server publishes to AI agents.
_Avoid_: MCP tool, command

**Agent tool group**:
A named set of **Agent tools** the user can switch on or off, such as `metadata` or `schema`.
_Avoid_: Category

**Effect class**:
Read, change or destructive, decided by Power Tools for every **Agent tool** call. It sets whether the user must approve.
_Avoid_: Risk level, hint

## Relationships

- A **Community tool** has a UI and may ship **Tool workers**
- A user installs, updates, disables and uninstalls **Community tools** through the **Catalog**
- Power Tools gives every **Community tool** the current **Theme tokens**; using them or the **Community UI kit** is the tool's choice
- Power Tools, never the **Agent tool**, decides a call's **Effect class**
