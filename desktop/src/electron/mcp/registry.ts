import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { AgentTool } from "./types.js";

const NAME_PATTERN = /^[a-z0-9_]{1,64}$/;
const EFFECT_MARKERS = ["Read-only.", "Changes the environment.", "Destructive:"];
const MAX_DESCRIPTION = 400;

export type Validation = { ok: true; args: Record<string, unknown> } | { ok: false; message: string };

export interface AgentToolRegistry {
  list(): Tool[];
  get(name: string): AgentTool | undefined;
  validate(tool: AgentTool, args: unknown): Validation;
}

function describeError(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  if (error.keyword === "required") return `"${String(params.missingProperty)}" is required`;
  if (error.keyword === "additionalProperties") return `"${String(params.additionalProperty)}" is not allowed`;
  const field = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
  return field ? `"${field}" ${error.message}` : `Arguments ${error.message}`;
}

export function createAgentToolRegistry(tools: AgentTool[]): AgentToolRegistry {
  const byName = new Map<string, AgentTool>();
  for (const tool of tools) {
    if (!NAME_PATTERN.test(tool.name)) throw new Error(`Invalid agent tool name "${tool.name}"`);
    if (byName.has(tool.name)) throw new Error(`Duplicate agent tool name "${tool.name}"`);
    if (tool.description.length > MAX_DESCRIPTION) {
      throw new Error(`Description of "${tool.name}" is longer than ${MAX_DESCRIPTION} characters`);
    }
    if (!EFFECT_MARKERS.some((marker) => tool.description.includes(marker))) {
      throw new Error(`Description of "${tool.name}" must state its effect class`);
    }
    if (tool.effect !== "read" && !tool.describe) {
      throw new Error(`"${tool.name}" can change the environment, so it needs a describe() for the approval dialog`);
    }
    byName.set(tool.name, tool);
  }

  const ajv = new Ajv({ allErrors: false, strict: true });
  const validators = new Map<string, ValidateFunction>();

  return {
    list() {
      return [...byName.values()].map((tool): Tool => {
        const effect = typeof tool.effect === "string" ? tool.effect : undefined;
        return {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: { ...tool.inputSchema },
          ...(tool.outputSchema ? { outputSchema: { ...tool.outputSchema } } : {}),
          annotations: {
            title: tool.title,
            ...(effect === "read" ? { readOnlyHint: true, idempotentHint: true } : {}),
            ...(effect === "destructive" ? { destructiveHint: true } : {}),
          },
        };
      });
    },
    get: (name) => byName.get(name),
    validate(tool, args) {
      let validator = validators.get(tool.name);
      if (!validator) {
        validator = ajv.compile(tool.inputSchema);
        validators.set(tool.name, validator);
      }
      const input = args ?? {};
      if (validator(input)) return { ok: true, args: input as Record<string, unknown> };
      return { ok: false, message: describeError(validator.errors![0]) };
    },
  };
}
