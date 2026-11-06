import type { ReactNode } from "react";

export function Seg<T extends string>({ value, options, onChange, disabled, full }: { value: T; options: Array<[T, string]>; onChange: (value: T) => void; disabled?: boolean; full?: boolean }) {
  return (
    <div className={"jc-seg" + (full ? " full" : "")} role="group" aria-disabled={disabled || undefined}>
      {options.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button className="jc-tgl" type="button" role="switch" aria-checked={checked} aria-label={label} aria-disabled={disabled || undefined} onClick={() => onChange(!checked)} />;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="r"><span>{label}</span>{children}</div>;
}
