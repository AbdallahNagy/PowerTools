---
seoTitle: "Bulk Workflow Execution for Dataverse and Dynamics 365 | PowerTools"
seoDescription: "Run an on-demand Dataverse workflow against every record a view or FetchXML query returns. Set batch size and delay, watch progress, and stop safely."
xrmToolBoxEquivalent: "Bulk Workflow Execution"
features:
  - Pick any activated on-demand classic workflow
  - Choose the records with a system view, a personal view, or pasted FetchXML
  - Count the matching records before you start
  - Set the batch size and an optional delay between batches
  - Watch progress, started count, errors, and time remaining
  - Stop after the current batch at any time
---

## Run a workflow on thousands of records

Bulk Workflow Execution starts an on-demand classic workflow for every record a query returns. It is the quickest way to backfill data, re-run business logic after a fix, or apply a process to records that existed before the workflow did.

Choose a workflow, then choose the records. Use one of the system or personal views on the workflow's table, or paste FetchXML from FetchXML Builder or FetchXML Tester. Count the records first so you know exactly how many runs you are about to start.

## Paced and stoppable

Runs go out in batches. You set the batch size and, if the environment is busy, a delay between batches. While it runs you see a progress bar, how many workflows started, how many failed, and an estimate of the time left. **Stop** finishes the current batch and then ends the run.

Each failed record is listed with its record ID and the error message, so you can find out what went wrong.

## When to use it

- Applying a new workflow to existing records.
- Re-running a process after fixing its logic.
- Running a workflow against a filtered set that a view or query describes better than a manual selection.

Each tab runs its own job, so you can run two different workflows at once.
