# Power Tools

A Windows desktop toolbox for Dataverse and Power Platform. It hosts tools that work against the user's Dataverse connections.

## Language

**Built-in tool**:
A tool that ships inside Power Tools and is maintained in this repository.
_Avoid_: Core tool, native tool

**Community tool**:
A tool written by a third party and installed by the user, which runs sandboxed and reaches Dataverse and the desktop only through the **Host API**.
_Avoid_: Plugin, extension, add-in (in Dataverse, "plugin" means server-side plugin code)

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

## Relationships

- A **Community tool** has a UI and may ship **Tool workers**
- A user installs, updates, disables and uninstalls **Community tools** through the **Catalog**
- Power Tools gives every **Community tool** the current **Theme tokens**; using them or the **Community UI kit** is the tool's choice
