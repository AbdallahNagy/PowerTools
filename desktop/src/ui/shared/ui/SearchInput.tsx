interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search…" }: SearchInputProps) {
  return (
    <div className="relative flex items-center">
      <svg
        className="absolute left-2.5 w-3.5 h-3.5 text-[#858585] pointer-events-none"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-8 py-1.5 bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-sm rounded-sm
                   placeholder-[#858585] focus:outline-none focus:border-[#007fd4]"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 text-[#858585] hover:text-white text-xs"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
