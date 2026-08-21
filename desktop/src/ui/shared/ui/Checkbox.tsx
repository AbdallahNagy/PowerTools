interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

export function Checkbox({ checked, onChange, disabled, id }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 accent-[#007fd4] cursor-pointer disabled:cursor-not-allowed"
    />
  );
}
