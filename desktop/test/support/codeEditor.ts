import { act } from "@testing-library/react";
import { EditorView } from "@codemirror/view";

/**
 * CodeEditor renders CodeMirror, which is contenteditable rather than a
 * <textarea>, so fireEvent.change does not apply. These helpers read and
 * replace its text the way a user edit would.
 */
function viewFor(element: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(element);
  if (!view) throw new Error("Element is not inside a CodeEditor.");
  return view;
}

export function codeEditorValue(element: HTMLElement): string {
  return viewFor(element).state.doc.toString();
}

export function setCodeEditorValue(element: HTMLElement, value: string): void {
  const view = viewFor(element);
  act(() => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      userEvent: "input",
    });
  });
}
