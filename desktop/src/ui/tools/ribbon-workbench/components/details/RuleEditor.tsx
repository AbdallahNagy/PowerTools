import { useId } from "react";
import { Plus } from "lucide-react";
import { Alert, Button, Checkbox, Field, Input, Select } from "../../../../shared/ui";
import { attr, el, elements, withAttr } from "../../model/node";
import { move } from "../../model/rows";
import type { RibbonNode, RuleAttribute, RuleType, RuleUsage } from "../../model/types";
import { RowControls } from "./EditorParts";

const OR_RULE = "OrRule";

interface RuleEditorProps {
  kind: "enableRule" | "displayRule";
  rule: RibbonNode;
  ruleTypes: readonly RuleType[];
  readOnly: boolean;
  notice: string | null;
  usedBy: readonly string[];
  onChange: (rule: RibbonNode) => void;
  onOpenCommand: (id: string) => void;
  onDelete: () => void;
}

export function RuleEditor(props: RuleEditorProps) {
  const usage: RuleUsage = props.kind === "enableRule" ? "enable" : "display";
  const types = props.ruleTypes.filter((type) => type.usage.includes(usage));
  const steps = elements(props.rule);
  const used = props.usedBy.length;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg-strong">{props.kind === "enableRule" ? "Enable rule" : "Display rule"}</h3>
      {props.notice ? <Alert tone="info">{props.notice}</Alert> : null}
      <Field label="Id">
        <Input className="font-mono" value={attr(props.rule, "Id") ?? ""} disabled={props.readOnly} onChange={(event) => props.onChange(withAttr(props.rule, "Id", event.target.value))} />
      </Field>
      <section aria-label="Steps" className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-fg-muted">Steps</h4>
        <Steps
          steps={steps}
          types={types}
          readOnly={props.readOnly}
          path="Step"
          onChange={(next) => props.onChange({ ...props.rule, children: next })}
        />
      </section>
      <section aria-label="Used by" className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-fg-muted">Used by</h4>
        {used === 0 ? <p className="text-xs text-fg-muted">No commands use this rule.</p> : null}
        <ul>
          {props.usedBy.map((id) => (
            <li key={id}>
              <button type="button" className="font-mono text-xs text-accent-text hover:underline" onClick={() => props.onOpenCommand(id)}>
                {id}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {!props.notice ? (
        <div className="border-t border-line pt-3">
          <Button variant="danger" size="sm" disabled={props.readOnly || used > 0} onClick={props.onDelete}>
            Delete
          </Button>
          {used > 0 ? <p className="mt-1 text-xs text-fg-muted">{`Used by ${used} command${used === 1 ? "" : "s"}`}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

interface StepsProps {
  steps: RibbonNode[];
  types: readonly RuleType[];
  readOnly: boolean;
  /** Accessible name prefix, such as "Step" or "Step 2, alternative 1, step". */
  path: string;
  onChange: (steps: RibbonNode[]) => void;
}

function newStep(type: RuleType | undefined): RibbonNode {
  if (!type) return el("FormStateRule", { State: "Existing" });
  return type.name === OR_RULE ? el(OR_RULE, {}, [el("Or")]) : el(type.name);
}

function Steps({ steps, types, readOnly, path, onChange }: StepsProps) {
  const firstType = types.find((type) => type.name !== OR_RULE);
  return (
    <div className="flex flex-col gap-2">
      {steps.length === 0 ? <p className="text-xs text-fg-muted">No steps.</p> : null}
      {steps.map((step, index) => (
        <Step
          key={index}
          step={step}
          name={`${path} ${index + 1}`}
          index={index}
          count={steps.length}
          types={types}
          readOnly={readOnly}
          onChange={(next) => onChange(steps.map((item, i) => (i === index ? next : item)))}
          onMove={(from, to) => onChange(move(steps, from, to))}
          onRemove={(at) => onChange(steps.filter((_, i) => i !== at))}
        />
      ))}
      <div>
        <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => onChange([...steps, newStep(firstType)])}>
          <Plus size={14} aria-hidden="true" /> Add step
        </Button>
      </div>
    </div>
  );
}

interface StepProps {
  step: RibbonNode;
  name: string;
  index: number;
  count: number;
  types: readonly RuleType[];
  readOnly: boolean;
  onChange: (step: RibbonNode) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

function Step({ step, name, index, count, types, readOnly, onChange, onMove, onRemove }: StepProps) {
  const invertId = useId();
  const type = types.find((item) => item.name === step.name);
  const fields = (type?.attributes ?? []).filter((attribute) => attribute.name !== "InvertResult");
  const canInvert = type?.attributes.some((attribute) => attribute.name === "InvertResult") ?? false;

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-line p-2">
      <div className="flex items-end gap-1">
        <Field label="Type" className="flex-1">
          <Select
            aria-label={`${name} type`}
            value={step.name}
            disabled={readOnly}
            onChange={(event) => onChange(newStep(types.find((item) => item.name === event.target.value)))}
          >
            {!type ? <option value={step.name}>{step.name}</option> : null}
            {types.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name === OR_RULE ? "Or group" : item.name}
              </option>
            ))}
          </Select>
        </Field>
        <RowControls name={name.toLowerCase()} index={index} count={count} disabled={readOnly} onMove={onMove} onRemove={onRemove} />
      </div>
      {!type ? <p className="text-xs text-fg-muted">The editor does not know this rule type. It is kept as it is.</p> : null}
      {step.name === OR_RULE ? (
        <OrGroups step={step} name={name} types={types} readOnly={readOnly} onChange={onChange} />
      ) : (
        fields.map((attribute) => (
          <AttributeField key={attribute.name} attribute={attribute} step={step} readOnly={readOnly} onChange={onChange} />
        ))
      )}
      {canInvert ? (
        <label htmlFor={invertId} className="flex items-center gap-1.5 text-xs text-fg">
          <Checkbox
            id={invertId}
            checked={attr(step, "InvertResult") === "true"}
            disabled={readOnly}
            onChange={(checked) => onChange(withAttr(step, "InvertResult", checked ? "true" : null))}
          />
          Invert result
        </label>
      ) : null}
    </div>
  );
}

function OrGroups({ step, name, types, readOnly, onChange }: Omit<StepProps, "index" | "count" | "onMove" | "onRemove">) {
  const groups = elements(step).filter((item) => item.name === "Or");
  const setGroups = (list: RibbonNode[]) => onChange({ ...step, children: list });
  return (
    <div className="flex flex-col gap-1 border-l-2 border-line pl-2">
      {groups.map((group, index) => (
        <div key={index} className="flex flex-col gap-1">
          {index > 0 ? (
            <span className="self-start rounded-sm bg-alt-soft px-1.5 py-0.5 text-xs font-medium text-alt">OR</span>
          ) : null}
          <Steps
            steps={elements(group)}
            types={types}
            readOnly={readOnly}
            path={`${name}, alternative ${index + 1}, step`}
            onChange={(next) => setGroups(groups.map((item, i) => (i === index ? { ...item, children: next } : item)))}
          />
          {groups.length > 1 ? (
            <div>
              <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setGroups(groups.filter((_, i) => i !== index))}>
                Remove alternative
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      <div>
        <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setGroups([...groups, el("Or")])}>
          <Plus size={14} aria-hidden="true" /> Add alternative
        </Button>
      </div>
    </div>
  );
}

interface AttributeFieldProps {
  attribute: RuleAttribute;
  step: RibbonNode;
  readOnly: boolean;
  onChange: (step: RibbonNode) => void;
}

function AttributeField({ attribute, step, readOnly, onChange }: AttributeFieldProps) {
  const checkboxId = useId();
  const value = attr(step, attribute.name);
  const label = attribute.required ? `${attribute.name} (required)` : attribute.name;
  const set = (next: string | null) => onChange(withAttr(step, attribute.name, next));

  if (attribute.kind === "bool") {
    return (
      <label htmlFor={checkboxId} className="flex items-center gap-1.5 text-xs text-fg">
        <Checkbox id={checkboxId} checked={value === "true"} disabled={readOnly} onChange={(checked) => set(checked ? "true" : attribute.required ? "false" : null)} />
        {label}
      </label>
    );
  }
  if (attribute.kind === "enum") {
    const values = attribute.values ?? [];
    return (
      <Field label={label}>
        <Select value={value ?? ""} disabled={readOnly} onChange={(event) => set(event.target.value || null)}>
          <option value="">{attribute.required ? "Choose a value" : "Not set"}</option>
          {value && !values.includes(value) ? <option value={value}>{value}</option> : null}
          {values.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <Input
        type={attribute.kind === "int" ? "number" : "text"}
        className={attribute.kind === "text" ? "font-mono" : undefined}
        value={value ?? ""}
        disabled={readOnly}
        onChange={(event) => set(event.target.value || null)}
      />
    </Field>
  );
}
