import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { preloadCodeEditor } from "../../src/ui/shared/ui/loadCodeEditor";
import { httpServer } from "../support/httpServer";

// jsdom is several times slower on Windows than on Linux. The heaviest tool tests take
// about half a second on Linux and about five on Windows, so give findBy and waitFor
// the same headroom the test timeout has. Passing tests do not wait any longer.
configure({ asyncUtilTimeout: 5000 });

// CodeMirror measures text through Range.getClientRects, which jsdom does not implement.
// Without these, every editor logs "getClientRects is not a function" while it measures.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => document.createElement("span").getClientRects();
  Range.prototype.getBoundingClientRect = () => document.createElement("span").getBoundingClientRect();
}

// Radix popovers, such as the Combobox list, measure their anchor; jsdom has no ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

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
