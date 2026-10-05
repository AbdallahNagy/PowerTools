import type { ReactNode } from "react";
import { Button, Modal } from "../../../shared/ui";
import { buildDetailSections, type DetailSection, optionsView, relatedTables } from "../model/details";
import { displayLabel } from "../model/search";
import type { AttributeInfo } from "../model/types";
import { CopyButton } from "./CopyButton";

interface FieldDetailsModalProps {
  field: AttributeInfo | null;
  /** Logical names of tables that can be opened from a lookup. */
  knownTables: ReadonlySet<string>;
  onClose: () => void;
  onOpenTable: (logicalName: string) => void;
}

export function FieldDetailsModal({ field, knownTables, onClose, onOpenTable }: FieldDetailsModalProps) {
  return (
    <Modal open={field !== null} title={field ? displayLabel(field) : ""} onClose={onClose}>
      {field ? <Details field={field} knownTables={knownTables} onOpenTable={onOpenTable} /> : null}
    </Modal>
  );
}

function Details({
  field,
  knownTables,
  onOpenTable,
}: {
  field: AttributeInfo;
  knownTables: ReadonlySet<string>;
  onOpenTable: (logicalName: string) => void;
}) {
  const sections = buildDetailSections(field);
  const sectionById = (id: DetailSection["id"]) => sections.find((section) => section.id === id);
  const related = relatedTables(field);
  const options = optionsView(field);

  return (
    <>
      <div className="flex flex-col gap-1 text-xs">
        <NameLine label="Logical name" value={field.logicalName} copyLabel="Copy logical name" />
        <NameLine label="Schema name" value={field.schemaName} copyLabel="Copy schema name" />
      </div>

      <SectionRows section={sectionById("general")} />

      <SectionRows section={sectionById("typeDetails")} />

      {related.length > 0 ? (
        <Section title="Related tables">
          <ul className="flex flex-col gap-1">
            {related.map((item) => (
              <li key={item.logicalName} className="flex items-baseline gap-3">
                {knownTables.has(item.logicalName) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="!px-0 !py-0 font-mono text-[var(--color-primary)] hover:underline"
                    onClick={() => onOpenTable(item.logicalName)}
                  >
                    {item.logicalName}
                  </Button>
                ) : (
                  <span className="font-mono text-[var(--color-text-gray)]">{item.logicalName}</span>
                )}
                {item.relationship ? (
                  <span className="font-mono text-xs text-[var(--color-text-dark-gray)]">
                    {item.relationship}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {options ? (
        <Section title="Options">
          {options.name || options.scope ? (
            <p className="text-[var(--color-text-gray)]">
              {options.name ? <span className="font-mono">{options.name}</span> : null}
              {options.scope ? (
                <span className="ml-2 text-[var(--color-text-dark-gray)]">{options.scope}</span>
              ) : null}
            </p>
          ) : null}
          <table className="w-full text-left text-[var(--color-text-gray)]">
            <thead>
              <tr className="text-xs text-[var(--color-text-dark-gray)]">
                <th scope="col" className="w-24 py-0.5 pr-3 font-medium">Value</th>
                <th scope="col" className="py-0.5 font-medium">Label</th>
              </tr>
            </thead>
            <tbody>
              {options.options.map((option) => (
                <tr key={option.value}>
                  <td className="py-0.5 pr-3 font-mono">{option.value}</td>
                  <td className="py-0.5">{option.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      <SectionRows section={sectionById("behavior")} />
    </>
  );
}

function SectionRows({ section }: { section: DetailSection | undefined }) {
  if (!section) return null;
  return (
    <Section title={section.title}>
      <Rows rows={section.rows} />
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-dark-gray)]">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: Array<{ label: string; value: string; muted?: string }> }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {rows.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-[var(--color-text-dark-gray)]">{item.label}</dt>
          <dd className="min-w-0 break-words text-[var(--color-text-gray)]">
            {item.value}
            {item.muted ? (
              <span className="ml-2 text-xs text-[var(--color-text-dark-gray)]">{item.muted}</span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function NameLine({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[var(--color-text-dark-gray)]">{label}</span>
      <span className="font-mono text-[var(--color-text-gray)]">{value}</span>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}
