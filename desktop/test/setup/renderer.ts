import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { httpServer } from "../support/httpServer";

beforeAll(() => httpServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  httpServer.resetHandlers();
});
afterAll(() => httpServer.close());
