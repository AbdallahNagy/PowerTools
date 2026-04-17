interface Step {
  label: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center gap-0 mb-6 select-none">
      {steps.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  done
                    ? "bg-[#007fd4] text-white"
                    : active
                    ? "bg-[#007fd4] text-white ring-2 ring-[#007fd4]/40"
                    : "bg-[#3c3c3c] text-[#858585]"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  active ? "text-white font-medium" : done ? "text-[#007fd4]" : "text-[#858585]"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-8 mx-2 shrink-0 ${done ? "bg-[#007fd4]" : "bg-[#3c3c3c]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
