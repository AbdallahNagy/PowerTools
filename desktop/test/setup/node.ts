import { afterAll, afterEach, beforeAll } from "vitest";

import { httpServer } from "../support/httpServer";

beforeAll(() => httpServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => httpServer.resetHandlers());
afterAll(() => httpServer.close());
