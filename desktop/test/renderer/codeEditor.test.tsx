import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CodeEditor } from "../../src/ui/shared/ui";
import { codeEditorValue, setCodeEditorValue } from "../support/codeEditor";

describe("CodeEditor", () => {
  it("is a labelled textbox that reports edits", () => {
    const onChange = vi.fn();
    render(<CodeEditor aria-label="FetchXML" value="<fetch />" onChange={onChange} />);

    const editor = screen.getByRole("textbox", { name: "FetchXML" });
    expect(codeEditorValue(editor)).toBe("<fetch />");

    setCodeEditorValue(editor, "<fetch top='5' />");
    expect(onChange).toHaveBeenLastCalledWith("<fetch top='5' />");
  });

  it("applies a new value from props without echoing it to onChange", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CodeEditor aria-label="FetchXML" value="a" onChange={onChange} />);
    rerender(<CodeEditor aria-label="FetchXML" value="b" onChange={onChange} />);

    expect(codeEditorValue(screen.getByRole("textbox", { name: "FetchXML" }))).toBe("b");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays in sync with controlled state", () => {
    function Harness() {
      const [value, setValue] = useState("");
      return (
        <>
          <CodeEditor aria-label="FetchXML" value={value} onChange={setValue} />
          <output>{value}</output>
        </>
      );
    }
    render(<Harness />);
    setCodeEditorValue(screen.getByRole("textbox", { name: "FetchXML" }), "<fetch>");
    expect(screen.getByRole("status")).toHaveTextContent("<fetch>");
  });

  it("marks a read-only editor", () => {
    render(<CodeEditor aria-label="Generated FetchXML" value="<fetch />" readOnly />);
    expect(screen.getByRole("textbox", { name: "Generated FetchXML" })).toHaveAttribute(
      "aria-readonly",
      "true",
    );
  });
});

describe("CodeEditor loading", () => {
  it("shows a busy frame until the editor code loads, then the editor", async () => {
    vi.resetModules();
    const { CodeEditor: FreshCodeEditor } = await import("../../src/ui/shared/ui/CodeEditor");
    render(<FreshCodeEditor aria-label="FetchXML" value="<fetch />" className="h-32" />);

    const frame = screen.getByLabelText("FetchXML");
    expect(frame).toHaveAttribute("aria-busy", "true");
    expect(frame).toHaveClass("h-32");

    await waitFor(() =>
      expect(codeEditorValue(screen.getByRole("textbox", { name: "FetchXML" }))).toBe("<fetch />"),
    );
    expect(screen.queryByLabelText("FetchXML", { selector: "[aria-busy]" })).not.toBeInTheDocument();
  });
});
