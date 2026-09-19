import axios from "axios";
import type { RegistrationProblem } from "./contracts";

export interface RegistrationError {
  message: string;
  code?: string;
  problems: RegistrationProblem[];
}

export function toRegistrationError(err: unknown): RegistrationError {
  if (axios.isAxiosError(err) && err.response?.data && typeof err.response.data === "object") {
    const data = err.response.data as {
      message?: string;
      code?: string;
      problems?: RegistrationProblem[];
    };
    return {
      message: data.message || err.message,
      code: data.code,
      problems: Array.isArray(data.problems) ? data.problems : [],
    };
  }

  if (err instanceof Error) return { message: err.message, problems: [] };
  return { message: "The registration request failed.", problems: [] };
}

export function problemFor(
  problems: RegistrationProblem[],
  field: string,
): string | undefined {
  return problems.find((problem) => problem.field === field)?.message;
}
