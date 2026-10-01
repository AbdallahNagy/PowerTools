export default function EmptyWorkspace() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-2 text-center text-sm text-[var(--color-text-dark-gray)]">
        <p>Select a tool from the sidebar.</p>
        <p>Ctrl+P to search tools</p>
        <p>Ctrl+B to show or hide the sidebar</p>
      </div>
    </div>
  );
}
