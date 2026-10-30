---
seoTitle: "Data Migration Between Dataverse Environments | PowerTools"
seoDescription: "Copy Dataverse and Dynamics 365 records from one environment to another. Pick tables and columns, filter with FetchXML, preview, then create, update, or delete."
features:
  - Choose a source and one or more target environments
  - Migrate to the next target in one click with the same settings
  - Pick the table and the exact columns to move
  - Filter the source records with a FetchXML filter
  - Preview the records before anything is written
  - Create new records, update existing ones, or both, and skip the rest
  - Keep inactive records inactive in the target
  - Optionally delete target records that are not in the source, after confirming each one
  - Follow each migration job's status as it runs
---

## Move data between environments

Data Migration copies records from one Dataverse or Dynamics 365 environment to another, for example from development to test, or from a configured sandbox into production. It is built for the reference and configuration data developers move all the time.

Choose a source and one or more targets, then pick a table. Only columns that can be written are offered, and the primary key is always kept so records keep the same ID in both environments.

## Control what moves

Narrow the source records with a FetchXML filter, then open **Preview** to see how many records will be sent and whether each one will be created, updated, or skipped in the target, before anything is written.

Choose how records are written:

- **Create** adds records that do not exist in the target. Records that already exist are skipped.
- **Update** overwrites records that already exist in the target with the same ID. Records that do not exist are skipped.
- **Both** creates or updates each record.
- **Delete** removes target records that are not among the source records you migrate, as in XrmToolBox Data Transporter. The filter only chooses source records, so target records outside it are deleted too, even when the source has them. Turning it on explains exactly what it does, and before each target runs you see the list of records to delete and confirm that number. If more records would be deleted when the run starts, nothing is deleted.

Inactive records stay inactive: a new record is created and then moved to its status in the same transaction.

Each migration runs as a job, and its status stays visible while you set up the next one.

## Promote through your environments

Add several targets, such as QC, UAT, and production, in the order you promote. Data Migration moves to one target at a time. When a target is done, it shows how many records moved and offers the next target in one click, with the same table, columns, filter, and options. Each target shows whether it is migrated, has errors, or is still to do, so you always know where the data went.

## When to use it

- Seeding a new environment with reference data.
- Keeping configuration tables in step across dev, test, and production.
- Copying a filtered set of records to reproduce a bug.

Data moves directly between your machine and your environments. Nothing passes through a third-party service.
