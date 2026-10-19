import { useId } from "react";
import { Plus, X } from "lucide-react";
import { Alert, Button, Checkbox, Field, Input, Select, cn } from "../../../../shared/ui";
import { attr, child, el, elements, withAttr } from "../../model/node";
import { move } from "../../model/rows";
import type { RibbonNode } from "../../model/types";
import { IconButton, RowControls } from "./EditorParts";

const PARAMETER_TYPES = [
  { value: "StringParameter", label: "String" },
  { value: "IntParameter", label: "Int" },
  { value: "BoolParameter", label: "Bool" },
  { value: "DecimalParameter", label: "Decimal" },
  { value: "CrmParameter", label: "Crm" },
];

/** CrmParameter values from the ribbon schema. */
const CRM_VALUES = [
  "CommandProperties",
  "FirstPrimaryItemId",
  "FirstSelectedItemId",
  "OrgLcid",
  "OrgName",
  "PrimaryControl",
  "PrimaryControlId",
  "PrimaryEntityTypeCode",
  "PrimaryEntityTypeName",
  "PrimaryItemIds",
  "SelectedControl",
  "SelectedControlAllItemCount",
  "SelectedControlAllItemIds",
  "SelectedControlAllItemReferences",
  "SelectedControlSelectedItemCount",
  "SelectedControlSelectedItemIds",
  "SelectedControlSelectedItemReferences",
  "SelectedControlUnselectedItemCount",
  "SelectedControlUnselectedItemIds",
  "SelectedControlUnselectedItemReferences",
  "SelectedEntityTypeCode",
  "SelectedEntityTypeName",
  "UserLcid",
];

const ORDER = ["EnableRules", "DisplayRules", "Actions"];

/** A copy of the command with one container's children replaced, creating the container in schema order. */
function withList(command: RibbonNode, container: string, list: RibbonNode[]): RibbonNode {
  const index = command.children.findIndex((item) => item.name === container);
  const children = [...command.children];
  if (index >= 0) {
    children[index] = { ...children[index]!, children: list };
  } else {
    const rank = ORDER.indexOf(container);
    const after = children.findIndex((item) => ORDER.indexOf(item.name) > rank);
    children.splice(after >= 0 ? after : children.length, 0, el(container, {}, list));
  }
  return { ...command, children };
}

interface CommandEditorProps {
  command: RibbonNode;
  readOnly: boolean;
  /** Shown above the form for a published command. */
  notice: string | null;
  canCustomise: boolean;
  enableRuleIds: readonly string[];
  displayRuleIds: readonly string[];
  knownEnable: ReadonlySet<string>;
  knownDisplay: ReadonlySet<string>;
  usedByControls: number;
  onChange: (command: RibbonNode) => void;
  onCustomise: () => void;
  onOpenRule: (kind: "enableRule" | "displayRule", id: string) => void;
  onDelete: () => void;
}

export function CommandEditor(props: CommandEditorProps) {
  const { command, readOnly } = props;
  const actions = elements(child(command, "Actions"));
  const setActions = (list: RibbonNode[]) => props.onChange(withList(command, "Actions", list));
  const setAction = (index: number, action: RibbonNode) => setActions(actions.map((item, i) => (i === index ? action : item)));

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg-strong">Command</h3>
      {props.notice ? (
        <Alert
          tone="info"
          action={
            props.canCustomise ? (
              <Button variant="secondary" size="sm" onClick={props.onCustomise}>
                Customise command
              </Button>
            ) : undefined
          }
        >
          {props.notice}
        </Alert>
      ) : null}
      <Field label="Id">
        <Input className="font-mono" value={attr(command, "Id") ?? ""} disabled={readOnly} onChange={(event) => props.onChange(withAttr(command, "Id", event.target.value))} />
      </Field>

      <section aria-label="Actions" className="flex flex-col gap-2">
        <h4 className="text-xs font-medium text-fg-muted">Actions</h4>
        {actions.length === 0 ? <p className="text-xs text-fg-muted">No actions.</p> : null}
        {actions.map((action, index) => (
          <ActionEditor
            key={index}
            action={action}
            index={index}
            count={actions.length}
            readOnly={readOnly}
            onChange={(next) => setAction(index, next)}
            onMove={(from, to) => setActions(move(actions, from, to))}
            onRemove={(at) => setActions(actions.filter((_, i) => i !== at))}
          />
        ))}
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={readOnly}
            onClick={() => setActions([...actions, el("JavaScriptFunction", { Library: "", FunctionName: "" })])}
          >
            <Plus size={14} aria-hidden="true" /> Add action
          </Button>
        </div>
      </section>

      <RuleReferences
        title="Enable rules"
        kind="enableRule"
        command={command}
        container="EnableRules"
        item="EnableRule"
        available={props.enableRuleIds}
        known={props.knownEnable}
        readOnly={readOnly}
        onChange={props.onChange}
        onOpen={props.onOpenRule}
      />
      <RuleReferences
        title="Display rules"
        kind="displayRule"
        command={command}
        container="DisplayRules"
        item="DisplayRule"
        available={props.displayRuleIds}
        known={props.knownDisplay}
        readOnly={readOnly}
        onChange={props.onChange}
        onOpen={props.onOpenRule}
      />

      {!props.notice ? (
        <div className="border-t border-line pt-3">
          <Button variant="danger" size="sm" disabled={readOnly || props.usedByControls > 0} onClick={props.onDelete}>
            Delete
          </Button>
          {props.usedByControls > 0 ? (
            <p className="mt-1 text-xs text-fg-muted">{`Used by ${props.usedByControls} control${props.usedByControls === 1 ? "" : "s"}`}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface ActionEditorProps {
  action: RibbonNode;
  index: number;
  count: number;
  readOnly: boolean;
  onChange: (action: RibbonNode) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

function ActionEditor({ action, index, count, readOnly, onChange, onMove, onRemove }: ActionEditorProps) {
  const passId = useId();
  const known = action.name === "JavaScriptFunction" || action.name === "Url";
  const name = `action ${index + 1}`;
  const parameters = elements(action).filter((item) => item.name.endsWith("Parameter"));
  const others = action.children.filter((item) => !item.name.endsWith("Parameter"));
  const setParameters = (list: RibbonNode[]) => onChange({ ...action, children: [...others, ...list] });

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-line p-2">
      <div className="flex items-end gap-1">
        <Field label="Type" className="flex-1">
          <Select
            value={known ? action.name : "other"}
            disabled={readOnly}
            onChange={(event) =>
              onChange(
                event.target.value === "Url"
                  ? el("Url", { Address: "" })
                  : el("JavaScriptFunction", { Library: "", FunctionName: "" }),
              )
            }
          >
            <option value="JavaScriptFunction">JavaScript function</option>
            <option value="Url">URL</option>
            {!known ? <option value="other">{action.name}</option> : null}
          </Select>
        </Field>
        <RowControls name={name} index={index} count={count} disabled={readOnly} onMove={onMove} onRemove={onRemove} />
      </div>
      {action.name === "JavaScriptFunction" ? (
        <>
          <Field label="Library">
            <Input className="font-mono" value={attr(action, "Library") ?? ""} disabled={readOnly} onChange={(event) => onChange(withAttr(action, "Library", event.target.value))} />
          </Field>
          <Field label="Function name">
            <Input className="font-mono" value={attr(action, "FunctionName") ?? ""} disabled={readOnly} onChange={(event) => onChange(withAttr(action, "FunctionName", event.target.value))} />
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">Parameters</span>
            {parameters.map((parameter, at) => (
              <div key={at} className="flex items-center gap-1">
                <Select
                  aria-label={`Parameter ${at + 1} type`}
                  className="w-28 shrink-0"
                  value={parameter.name}
                  disabled={readOnly}
                  onChange={(event) =>
                    setParameters(parameters.map((item, i) => (i === at ? el(event.target.value, { Value: "" }) : item)))
                  }
                >
                  {PARAMETER_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
                {parameter.name === "CrmParameter" ? (
                  <Select
                    aria-label={`Parameter ${at + 1} value`}
                    className="min-w-0 flex-1"
                    value={attr(parameter, "Value") ?? ""}
                    disabled={readOnly}
                    onChange={(event) => setParameters(parameters.map((item, i) => (i === at ? withAttr(item, "Value", event.target.value) : item)))}
                  >
                    {!CRM_VALUES.includes(attr(parameter, "Value") ?? "") ? <option value={attr(parameter, "Value") ?? ""}>{attr(parameter, "Value") || "Choose a value"}</option> : null}
                    {CRM_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    aria-label={`Parameter ${at + 1} value`}
                    className="min-w-0 flex-1"
                    value={attr(parameter, "Value") ?? ""}
                    disabled={readOnly}
                    onChange={(event) => setParameters(parameters.map((item, i) => (i === at ? withAttr(item, "Value", event.target.value) : item)))}
                  />
                )}
                <RowControls
                  name={`parameter ${at + 1}`}
                  index={at}
                  count={parameters.length}
                  disabled={readOnly}
                  onMove={(from, to) => setParameters(move(parameters, from, to))}
                  onRemove={(remove) => setParameters(parameters.filter((_, i) => i !== remove))}
                />
              </div>
            ))}
            <div>
              <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setParameters([...parameters, el("CrmParameter", { Value: "PrimaryControl" })])}>
                <Plus size={14} aria-hidden="true" /> Add parameter
              </Button>
            </div>
          </div>
        </>
      ) : null}
      {action.name === "Url" ? (
        <>
          <Field label="Address">
            <Input className="font-mono" value={attr(action, "Address") ?? ""} disabled={readOnly} onChange={(event) => onChange(withAttr(action, "Address", event.target.value))} />
          </Field>
          <label htmlFor={passId} className="flex items-center gap-1.5 text-xs text-fg">
            <Checkbox
              id={passId}
              checked={attr(action, "PassParams") === "true"}
              disabled={readOnly}
              onChange={(checked) => onChange(withAttr(action, "PassParams", checked ? "true" : null))}
            />
            Pass parameters
          </label>
        </>
      ) : null}
    </div>
  );
}

interface RuleReferencesProps {
  title: string;
  kind: "enableRule" | "displayRule";
  command: RibbonNode;
  container: string;
  item: string;
  available: readonly string[];
  known: ReadonlySet<string>;
  readOnly: boolean;
  onChange: (command: RibbonNode) => void;
  onOpen: (kind: "enableRule" | "displayRule", id: string) => void;
}

function RuleReferences(props: RuleReferencesProps) {
  const references = elements(child(props.command, props.container)).filter((node) => node.name === props.item);
  const ids = references.map((node) => attr(node, "Id") ?? "");
  const choices = props.available.filter((id) => !ids.includes(id));
  const setIds = (list: string[]) =>
    props.onChange(withList(props.command, props.container, list.map((id) => el(props.item, { Id: id }))));

  return (
    <section aria-label={props.title} className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-fg-muted">{props.title}</h4>
      {ids.length === 0 ? <p className="text-xs text-fg-muted">None.</p> : null}
      <ul className="flex flex-col gap-0.5">
        {ids.map((id, index) => {
          const missing = !props.known.has(id);
          return (
            <li key={`${id}-${index}`} className="flex items-center gap-1">
              <button
                type="button"
                className={cn("min-w-0 flex-1 truncate text-left font-mono text-xs hover:underline", missing ? "text-danger" : "text-accent-text")}
                onClick={() => props.onOpen(props.kind, id)}
              >
                {id}
              </button>
              {missing ? <span className="text-xs text-danger">Not defined</span> : null}
              <IconButton label={`Remove ${id}`} disabled={props.readOnly} onClick={() => setIds(ids.filter((_, i) => i !== index))}>
                <X size={14} aria-hidden="true" />
              </IconButton>
            </li>
          );
        })}
      </ul>
      {!props.readOnly ? (
        <Select
          aria-label={`Add ${props.title.toLowerCase().replace(/s$/, "")}`}
          value=""
          onChange={(event) => event.target.value && setIds([...ids, event.target.value])}
        >
          <option value="">{`Add ${props.title.toLowerCase().replace(/s$/, "")}…`}</option>
          {choices.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </Select>
      ) : null}
    </section>
  );
}
