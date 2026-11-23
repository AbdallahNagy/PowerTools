import appSpec from "../schemas/app_apply.input.json" with { type: "json" };
import choiceSpec from "../schemas/choice_apply.input.json" with { type: "json" };
import configSpec from "../schemas/config_apply.input.json" with { type: "json" };
import customApiSpec from "../schemas/customapi_apply.input.json" with { type: "json" };
import formSpec from "../schemas/form_apply.input.json" with { type: "json" };
import flowSpec from "../schemas/flow_apply.input.json" with { type: "json" };
import deploySpec from "../schemas/plugin_deploy.input.json" with { type: "json" };
import processSpec from "../schemas/process_apply.input.json" with { type: "json" };
import stepSpec from "../schemas/plugin_step_apply.input.json" with { type: "json" };
import removeSpec from "../schemas/remove.input.json" with { type: "json" };
import roleSpec from "../schemas/role_apply.input.json" with { type: "json" };
import solutionSpec from "../schemas/solution_apply.input.json" with { type: "json" };
import viewSpec from "../schemas/view_apply.input.json" with { type: "json" };
import webResourceSpec from "../schemas/webresource_apply.input.json" with { type: "json" };
import type { AgentTool } from "../types.js";
import { applyTool } from "./applyTool.js";
import { steps, str } from "./common.js";

const fileName = (path: unknown) => str(path).split(/[\\/]/).pop() ?? str(path);
const nameOf = (value: unknown) => str((value as { uniqueName?: unknown } | undefined)?.uniqueName ?? "");

/** choice_apply: a global choice and its options. */
export const choiceApply: AgentTool = applyTool({
  name: "choice_apply",
  family: "choice",
  group: "schema",
  title: "Apply a global choice",
  description:
    "Changes the environment. Creates or updates a global choice: label, description, options with labels, descriptions and colors, and their order. Options match by value, else by label; a new option gets the next value from the publisher's prefix. Options left out are kept; remove one with remove kind choiceoption. Local choices belong to table_apply.",
  spec: choiceSpec,
  describe: (args, plan) => `apply global choice ${str(args.name)} (${steps(plan.steps.length)})`,
  summarize: (args) => `choice_apply ${str(args.name)}`,
});

/** form_apply: patch operations on one existing form. */
export const formApply: AgentTool = applyTool({
  name: "form_apply",
  family: "form",
  group: "ui",
  title: "Change a form",
  description:
    "Changes the environment. A form or system dashboard: a whole layout (tabs, sections, fields; a dashboard's lists and charts) that creates it when missing, then operations: add, move or remove fields, sections, tabs, subgrids, labels, visibility, libraries and event handlers. What it already has is skipped. Read it first with inspect_ui kind form. Required level is set with table_apply.",
  spec: formSpec,
  describe: (args, plan) => `apply ${args.formType === "dashboard" ? "dashboard " : `form ${str(args.table)}/`}${str(args.form)} (${steps(plan.steps.length)})`,
  summarize: (args) => `form_apply ${args.table ? `${str(args.table)}/` : ""}${str(args.form)}`,
});

/** view_apply: one system view, written so its FetchXML and layout match. */
export const viewApply: AgentTool = applyTool({
  name: "view_apply",
  family: "view",
  group: "ui",
  title: "Apply a view",
  description:
    "Changes the environment. Creates a public view or updates a public, advancedFind, associated, quickFind or lookup view: columns and widths, filter, sort, quick find columns, default view. Dyno writes the FetchXML and layout so they match. Parts left out stay as they are. Read a view in this shape with inspect_ui kind view.",
  spec: viewSpec,
  describe: (args, plan) => `apply view ${str(args.table)}/${str(args.name ?? args.type ?? "public")} (${steps(plan.steps.length)})`,
  summarize: (args) => `view_apply ${str(args.table)}`,
});

/** solution_apply: publisher, solution, patch, components and roll-up. */
export const solutionApply: AgentTool = applyTool({
  name: "solution_apply",
  family: "solution",
  group: "solutions",
  title: "Apply a solution",
  description:
    "Changes the environment. Creates or updates a publisher and an unmanaged solution, creates a patch, and adds components by kind and name. rollUp merges the patches into the solution under a new version and deletes them: a destructive step. A solution's publisher cannot change. Read solutions with inspect_solution.",
  spec: solutionSpec,
  reportsProgress: true,
  describe: (args, plan) => `apply solution ${nameOf(args.solution)} (${steps(plan.steps.length)})`,
  summarize: (args) => `solution_apply ${nameOf(args.solution)}`,
});

/** config_apply: environment variables and connection references. */
export const configApply: AgentTool = applyTool({
  name: "config_apply",
  family: "config",
  group: "solutions",
  title: "Apply configuration",
  description:
    "Changes the environment. Creates or updates environment variable definitions (string, number, boolean, json, datasource) and their current values, and connection references. A variable's type and a reference's connector cannot change. Connection references are online only; on-premises they plan as unsupported. Secrets are not set here.",
  spec: configSpec,
  describe: (_args, plan) => `apply configuration (${steps(plan.steps.length)})`,
  summarize: () => "config_apply",
});

/** plugin_deploy: an assembly or a plug-in package from a local file. */
export const pluginDeploy: AgentTool = applyTool({
  name: "plugin_deploy",
  family: "plugin_deploy",
  group: "logic",
  title: "Deploy plug-ins",
  description:
    "Changes the environment. Registers or updates a plug-in assembly (.dll) from this computer, or a plug-in package (.nupkg, online only). New plug-in types are added; types missing from the file block the update and are never deleted. An unchanged file plans nothing. Register steps with plugin_step_apply.",
  spec: deploySpec,
  reportsProgress: true,
  describe: (args) => `deploy plug-in file ${fileName(args.path)}`,
  summarize: (args) => `plugin_deploy ${fileName(args.path)}`,
});

/** plugin_step_apply: steps, their images and enabled state. */
export const pluginStepApply: AgentTool = applyTool({
  name: "plugin_step_apply",
  family: "plugin_step",
  group: "logic",
  title: "Apply plug-in steps",
  description:
    "Changes the environment. Creates or updates plug-in steps matched by name, for a plug-in type or a service endpoint: message, table, stage, mode, rank, filtering columns, configuration, images and enabled state. Only what differs runs. Read a step in this shape with inspect_solution kind pluginstep. Unregister with remove.",
  spec: stepSpec,
  describe: (args, plan) => `apply ${(args.steps as unknown[] | undefined)?.length ?? 0} plug-in step(s) (${steps(plan.steps.length)})`,
  summarize: (args) => `plugin_step_apply ${((args.steps as Array<{ name?: unknown }> | undefined) ?? []).map((s) => str(s.name)).join(", ")}`,
});

/** remove: deletes or detaches one component. Never records. */
export const remove: AgentTool = applyTool({
  name: "remove",
  family: "remove",
  group: "remove",
  title: "Remove a component",
  description:
    "Destructive: deletes one component by kind and name (table, column, choice, choiceoption, form, view, webresource, process, flow, plug-in, envvar, solution and more), takes one out of a solution (solutioncomponent), or removes its unmanaged active layer. Refuses managed components and ones others depend on, and names them. Never records: use records_delete.",
  spec: removeSpec,
  describe: (args) => `remove ${str(args.kind)} ${str(args.name)}`,
  summarize: (args) => `remove ${str(args.kind)} ${str(args.name)}`,
});

/** webresource_apply: web resources from local files or a folder. */
export const webResourceApply: AgentTool = applyTool({
  name: "webresource_apply",
  family: "webresource",
  group: "ui",
  title: "Upload web resources",
  description:
    "Changes the environment. Creates or updates web resources from files on this computer, listed or a whole folder. The type comes from the extension; the name is basePath (default prefix_/) plus the file name or path in the folder. Unchanged content plans nothing; a type cannot change. Then use them in form_apply libraries or app_apply commands.",
  spec: webResourceSpec,
  reportsProgress: true,
  describe: (args, plan) => `upload web resources${args.folder ? ` from ${fileName(args.folder)}` : ""} (${steps(plan.steps.length)})`,
  summarize: (args) => `webresource_apply ${args.folder ? fileName(args.folder) : `${(args.files as unknown[] | undefined)?.length ?? 0} file(s)`}`,
});

/** app_apply: a model-driven app, its site map, components, roles and commands. */
export const appApply: AgentTool = applyTool({
  name: "app_apply",
  family: "app",
  group: "ui",
  title: "Apply a model-driven app",
  description:
    "Changes the environment. Creates or updates a model-driven app: its tables with their forms, views and charts, dashboards, the site map, the roles that can open it, and modern commands (online only). Then runs ValidateApp and publishes. Components and roles left out are kept. Read apps with inspect_ui kind app.",
  spec: appSpec,
  describe: (args, plan) => `apply app ${str(args.uniqueName)} (${steps(plan.steps.length)})`,
  summarize: (args) => `app_apply ${str(args.uniqueName)}`,
});

/** customapi_apply: a Custom API with its parameters and properties. */
export const customApiApply: AgentTool = applyTool({
  name: "customapi_apply",
  family: "customapi",
  group: "logic",
  title: "Apply a Custom API",
  description:
    "Changes the environment. Creates or updates a Custom API, its request parameters and response properties, and the plug-in type that runs it. Fields Dataverse fixes once saved (binding, function, step type, a parameter's type) are changed by deleting and creating again: the plan marks that destructive. Read one with inspect_solution kind customapi.",
  spec: customApiSpec,
  describe: (args, plan) => `apply Custom API ${str(args.uniqueName)} (${steps(plan.steps.length)})`,
  summarize: (args) => `customapi_apply ${str(args.uniqueName)}`,
});

/** flow_apply: a solution-aware cloud flow and its connection references (online only). */
export const flowApply: AgentTool = applyTool({
  name: "flow_apply",
  family: "flow",
  group: "logic",
  title: "Apply a cloud flow",
  description:
    "Changes the environment. Creates or updates a cloud flow from its definition, creates missing connection references, and turns it on or off. A flow whose references have no connection stays off; the result names the connectors the user must sign in to. Online only; on-premises, build a classic workflow with process_apply. Read the guide dyno://guides/cloud-flows first.",
  spec: flowSpec,
  describe: (args, plan) => `apply cloud flow ${str(args.name)} (${steps(plan.steps.length)})`,
  summarize: (args) => `flow_apply ${str(args.name)}`,
});

/** process_apply: a classic workflow or custom process action from typed steps (online and on-premises). */
export const processApply: AgentTool = applyTool({
  name: "process_apply",
  family: "process",
  group: "logic",
  title: "Apply a classic workflow",
  description:
    "Changes the environment. Creates or updates a classic workflow or custom process action from typed steps (update, create, send email, assign, change status, conditions, child workflow, action, custom step, stop) and activates it or leaves it in draft. Works online and on-premises. Read one with inspect_solution kind process. Read the guide dyno://guides/classic-workflows first.",
  spec: processSpec,
  describe: (args, plan) => `apply ${args.kind === "action" ? "action" : "workflow"} ${str(args.name)} (${steps(plan.steps.length)})`,
  summarize: (args) => `process_apply ${str(args.name)}`,
});

/** role_apply: a security role, who has it, and field security profiles. */
export const roleApply: AgentTool = applyTool({
  name: "role_apply",
  family: "role",
  group: "security",
  title: "Apply security",
  description:
    "Changes the environment. Creates or updates a security role: privileges per table and depth (basic, local, deep, global; none takes one away, destructive), other privileges by name, and the users and teams that have it. Also field security profiles: column permissions and members. Nothing left out is taken away. Read a role with inspect_schema kind role.",
  spec: roleSpec,
  describe: (args, plan) =>
    `apply ${[(args.role as { name?: unknown } | undefined)?.name ? `role ${str((args.role as { name?: unknown }).name)}` : "", (args.fieldSecurityProfiles as unknown[] | undefined)?.length ? "field security" : ""].filter(Boolean).join(" and ")} (${steps(plan.steps.length)})`,
  summarize: (args) => `role_apply ${str((args.role as { name?: unknown } | undefined)?.name ?? "field security")}`,
});
