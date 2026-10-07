const shortcutClassName =
  "justify-self-end rounded-sm border border-hover bg-raised p-0.5 text-fg";

export default function EmptyWorkspace() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="grid max-w-md grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 text-left text-sm text-fg-muted">
        <p>to search tools</p>
        <span className={shortcutClassName}>Ctrl+P</span>
        <p>to perform main tool action</p>
        <span className={shortcutClassName}>Ctrl+Enter</span>
        <p>to show or hide the sidebar</p>
        <span className={shortcutClassName}>Ctrl+B</span>
      </div>
    </div>
  );
}
