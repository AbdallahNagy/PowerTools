import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { preloadCodeEditor } from "../../src/ui/shared/ui/loadCodeEditor";
import { httpServer } from "../support/httpServer";

beforeAll(async () => {
  httpServer.listen({ onUnhandledRequest: "error" });
  // The app loads the code editor on first use; load it up front so tests can
  // query editors synchronously. codeEditor.test.tsx covers the lazy path.
  await preloadCodeEditor();
});
afterEach(() => {
  cleanup();
  httpServer.resetHandlers();
});
afterAll(() => httpServer.close());
