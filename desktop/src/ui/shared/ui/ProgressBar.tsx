interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-[#858585] mb-1">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-[#3c3c3c] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#007fd4] rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
