import { describe, expect, it } from "vitest";
import { toRegistrationError } from "../../model/apiError";
import axios from "axios";

describe("toRegistrationError", () => {
  it("reads a sidecar problem payload from an axios error", () => {
    const error = new axios.AxiosError("Request failed");
    error.response = {
      data: {
        code: "validation_failed",
        message: "The registration request is invalid.",
        problems: [{ field: "name", code: "required", message: "Step name is required." }],
      },
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    };

    expect(toRegistrationError(error)).toEqual({
      message: "The registration request is invalid.",
      code: "validation_failed",
      problems: [{ field: "name", code: "required", message: "Step name is required." }],
    });
  });

  it("falls back to Error.message", () => {
    expect(toRegistrationError(new Error("network down"))).toEqual({
      message: "network down",
      problems: [],
    });
  });
});
