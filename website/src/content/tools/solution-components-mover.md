---
seoTitle: "Solution Components Mover for Dataverse | PowerTools"
seoDescription: "Copy components from one or more Dataverse solutions into unmanaged solutions in the same environment. Pick component types and review every result."
xrmToolBoxEquivalent: "Solution Components Mover"
features:
  - Pick one or more source solutions, managed or unmanaged
  - Pick one or more unmanaged target solutions
  - Choose which component types to copy
  - Block copies that would break the managed-table best practice
  - See success or failure for every component
  - Open a solution in the browser from the list
---

## Reorganize solutions in minutes

Solution Components Mover copies components from the solutions you select into one or more unmanaged solutions in the same environment. Components stay in their source solutions. They are added to the targets, not moved out.

Use it to split a large solution into smaller ones, to build a patch-style solution from several others, or to collect everything a feature needs into one place for deployment.

## Pick exactly what to copy

Search and sort the solution list, then select sources and targets. Before the copy starts, choose the component types to include. Every type starts selected, and you can select all, clear all, or invert.

A best-practice check is on by default. It stops the copy when it would add a managed table with all of its assets into an unmanaged solution.

## Clear results

Every component add is reported as a success or a failure. One failure does not stop the rest. Clear or export the log when you are done.

## When to use it

- Splitting a monolithic solution by feature or team.
- Assembling a release solution from several work-in-progress solutions.
- Copying a set of components into a new solution before a refactor.
