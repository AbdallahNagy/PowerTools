import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import {
  parseMutationOutcome,
  parsePluginRegistrationProblem,
} from "../../model/pluginRegistrationError";

describe("plugin registration structured errors", () => {
  it.each([
    "validation",
    "dependency",
    "concurrency",
    "permission",
    "authentication",
    "dataverse",
    "communication",
    "verification",
    "unsupported",
  ] as const)("accepts the allowlisted %s category", (category) => {
    const error = new AxiosError("raw secret", "ERR_BAD_RESPONSE", undefined, undefined, {
      data: {
        category,
        code: "safe_code",
        message: "Safe guidance",
        environment: "Development",
        component: "Contoso.Plugin",
        correlationId: "correlation-1",
        suggestedAction: "Refresh and try again",
        rawBody: "Bearer secret-token",
      },
      status: 409,
      statusText: "Conflict",
      headers: {},
      config: { headers: new AxiosHeaders() },
    });

    expect(parsePluginRegistrationProblem(error)).toEqual({
      category,
      code: "safe_code",
      message: "Safe guidance",
      environment: "Development",
      component: "Contoso.Plugin",
      correlationId: "correlation-1",
      suggestedAction: "Refresh and try again",
    });
  });

  it("replaces malformed or untrusted Axios bodies with a generic safe problem", () => {
    const error = new AxiosError("Bearer secret-token", "ERR_BAD_RESPONSE", undefined, undefined, {
      data: { category: "root", message: "Bearer secret-token", stack: "private stack" },
      status: 500,
      statusText: "Failure",
      headers: {},
      config: { headers: new AxiosHeaders() },
    });

    const parsed = parsePluginRegistrationProblem(error);

    expect(parsed.category).toBe("communication");
    expect(JSON.stringify(parsed)).not.toContain("secret-token");
    expect(JSON.stringify(parsed)).not.toContain("private stack");
  });

  it.each([
    "succeededAndVerified",
    "rejectedBeforeCompletion",
    "reconciledAfterCommunicationFailure",
    "outcomeUncertain",
  ] as const)("accepts the allowlisted %s outcome", (outcome) => {
    expect(parseMutationOutcome({ outcome, targetId: "component-1" })).toMatchObject({
      outcome,
      targetId: "component-1",
    });
  });

  it("does not copy arbitrary fields from an outcome body", () => {
    const parsed = parseMutationOutcome({
      outcome: "outcomeUncertain",
      targetId: "component-1",
      rawBody: "Bearer secret-token",
    });

    expect(JSON.stringify(parsed)).not.toContain("secret-token");
  });
});
