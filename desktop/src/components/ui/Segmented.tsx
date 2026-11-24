import type React from 'react';

/** Pill-style segmented control: the selected option is a white pill on a dark track. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    // rounded-[22px], not rounded-full: one row is still a pill (44 px tall), but options that
    // wrap onto a second row keep a rounded box instead of turning into a blob.
    <div className="ui-track inline-flex flex-wrap gap-1 rounded-[22px] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`press flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold cursor-pointer ${
            value === o.id ? 'ui-selected' : 'text-white/70 hover:text-white'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
