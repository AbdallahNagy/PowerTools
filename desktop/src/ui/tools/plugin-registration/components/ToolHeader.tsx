import { Button, Checkbox, SearchInput } from "../../../shared/ui";

interface ToolHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  showSystem: boolean;
  onShowSystemChange: (value: boolean) => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
  onRegisterAssembly: () => void;
  registerAssemblyDisabled: boolean;
}

export function ToolHeader({
  search,
  onSearchChange,
  showSystem,
  onShowSystemChange,
  onRefresh,
  refreshDisabled,
  onRegisterAssembly,
  registerAssemblyDisabled,
}: ToolHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder="Search assemblies, types, steps…"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-text-dark-gray)] pb-1.5">
          <Checkbox checked={showSystem} onChange={onShowSystemChange} id="show-system" />
          Show system
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onRefresh}
          disabled={refreshDisabled}
        >
          Refresh
        </Button>
        <Button
          type="button"
          onClick={onRegisterAssembly}
          disabled={registerAssemblyDisabled}
        >
          Register assembly
        </Button>
      </div>
    </div>
  );
}
