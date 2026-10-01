import PowerToolsIcon from "../../assets/icons/power-tools-preview-256.png";

export default function EmptyWorkspace() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <img src={PowerToolsIcon} alt="" className="mb-5 h-16 w-16" />
        <h1 className="text-3xl font-light tracking-tight text-[var(--color-text-white)]">
          Power Tools
        </h1>
        <p className="mt-3 text-lg text-[var(--color-text-gray)]">Open a tool</p>
        <p className="mt-2 text-sm text-[var(--color-text-dark-gray)]">
          Select one from the sidebar, or press Ctrl+P.
        </p>
      </div>
    </div>
  );
}
