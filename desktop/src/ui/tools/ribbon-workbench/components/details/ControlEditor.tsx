import { Alert, Button, Field, Input, Select } from "../../../../shared/ui";
import type { BarNode } from "../../model/commandBar";
import { attr, withAttr } from "../../model/node";
import type { RibbonNode, RibbonTemplate } from "../../model/types";
import { TextOrLabel } from "./EditorParts";

const KIND_NAMES: Record<BarNode["type"], string> = {
  tab: "Tab",
  group: "Group",
  button: "Button",
  flyout: "Flyout",
  splitButton: "Split button",
  menuSection: "Menu section",
  control: "Control",
};

interface ControlEditorProps {
  node: BarNode;
  /** The element to edit: the solution's own definition for a custom item, the published one otherwise. */
  element: RibbonNode;
  readOnly: boolean;
  readOnlyReason: string | null;
  commandIds: readonly string[];
  labelIds: readonly string[];
  templates: readonly RibbonTemplate[];
  layout: string | null;
  solutionCommands: ReadonlySet<string>;
  onChange: (element: RibbonNode) => void;
  onLayoutChange: (layout: string) => void;
  onOpenCommand: (id: string) => void;
  onHide: () => void;
  onShow: () => void;
  onCustomise: (commandId: string) => void;
  onDelete: () => void;
}

export function ControlEditor(props: ControlEditorProps) {
  const { node, element } = props;
  const base = node.source === "base";
  const disabled = props.readOnly || base;
  const labelAttribute = node.type === "group" || node.type === "menuSection" || node.type === "tab" ? "Title" : "LabelText";
  const set = (name: string, value: string | null) => props.onChange(withAttr(element, name, value));
  const command = attr(element, "Command");
  const template = props.templates.find((item) => item.id === attr(element, "Template")) ?? null;
  // Menu sections and tabs have no command, tooltip, or images in the ribbon schema; groups have no tooltip or images.
  const buttonLike = node.type === "button" || node.type === "flyout" || node.type === "splitButton" || node.type === "control";
  const hasCommand = buttonLike || node.type === "group";

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg-strong">{KIND_NAMES[node.type]}</h3>
      {base ? (
        <Alert tone="info">
          {node.hidden
            ? "This built-in item is hidden by this solution."
            : "This item is part of the published command bar. You can hide it or customise its command, but not change it."}
        </Alert>
      ) : null}
      {props.readOnly && props.readOnlyReason && !base ? <Alert tone="info">{props.readOnlyReason}</Alert> : null}

      <Field label="Id">
        <Input className="font-mono" value={attr(element, "Id") ?? ""} disabled={disabled} onChange={(event) => set("Id", event.target.value)} />
      </Field>
      <TextOrLabel
        label="Label"
        value={attr(element, labelAttribute)}
        labelIds={props.labelIds}
        disabled={disabled}
        onChange={(value) => set(labelAttribute, value)}
      />
      {buttonLike ? (
        <TextOrLabel
          label="Tooltip"
          value={attr(element, "ToolTipTitle")}
          labelIds={props.labelIds}
          disabled={disabled}
          onChange={(value) => set("ToolTipTitle", value)}
        />
      ) : null}
      {hasCommand ? (
      <Field label="Command">
        <div className="flex gap-2">
          <Select
            className="min-w-0 flex-1 font-mono"
            value={command ?? ""}
            disabled={disabled}
            onChange={(event) => set("Command", event.target.value || null)}
          >
            <option value="">None</option>
            {command && !props.commandIds.includes(command) ? <option value={command}>{command}</option> : null}
            {props.commandIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" disabled={!command} onClick={() => command && props.onOpenCommand(command)}>
            Open
          </Button>
        </div>
      </Field>
      ) : null}
      <Field label="Sequence">
        <Input
          type="number"
          value={attr(element, "Sequence") ?? ""}
          disabled={disabled}
          onChange={(event) => set("Sequence", event.target.value || null)}
        />
      </Field>
      {buttonLike ? (
        <>
          <Field label="Image 16">
            <Input className="font-mono" value={attr(element, "Image16by16") ?? ""} disabled={disabled} onChange={(event) => set("Image16by16", event.target.value)} />
          </Field>
          <Field label="Image 32">
            <Input className="font-mono" value={attr(element, "Image32by32") ?? ""} disabled={disabled} onChange={(event) => set("Image32by32", event.target.value)} />
          </Field>
          <Field label="Modern image">
            <Input className="font-mono" value={attr(element, "ModernImage") ?? ""} disabled={disabled} onChange={(event) => set("ModernImage", event.target.value)} />
          </Field>
        </>
      ) : null}
      {node.type === "group" ? (
        <>
          <Field label="Template">
            <Select
              className="font-mono"
              value={attr(element, "Template") ?? ""}
              disabled={disabled}
              onChange={(event) => set("Template", event.target.value || null)}
            >
              {!template && attr(element, "Template") ? <option value={attr(element, "Template")!}>{attr(element, "Template")}</option> : null}
              {!attr(element, "Template") ? <option value="">Choose a template</option> : null}
              {props.templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Layout">
            <Select value={props.layout ?? ""} disabled={disabled || !template} onChange={(event) => props.onLayoutChange(event.target.value)}>
              {!props.layout ? <option value="">Choose a layout</option> : null}
              {props.layout && !template?.layouts.includes(props.layout) ? <option value={props.layout}>{props.layout}</option> : null}
              {(template?.layouts ?? []).map((layout) => (
                <option key={layout} value={layout}>
                  {layout}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {base ? (
          node.hidden ? (
            <Button variant="secondary" size="sm" disabled={props.readOnly} onClick={props.onShow}>
              Show again
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={props.readOnly} onClick={props.onHide}>
              Hide
            </Button>
          )
        ) : null}
        {base && command && !props.solutionCommands.has(command) ? (
          <Button variant="secondary" size="sm" disabled={props.readOnly} onClick={() => props.onCustomise(command)}>
            Customise command
          </Button>
        ) : null}
        {!base ? (
          <Button variant="danger" size="sm" disabled={props.readOnly} onClick={props.onDelete}>
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
