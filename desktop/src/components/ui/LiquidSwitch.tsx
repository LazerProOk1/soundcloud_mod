import React from 'react';

interface LiquidSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** The one on/off switch of the app: flat track (accent when on), white round thumb. */
export const LiquidSwitch = React.memo(function LiquidSwitch({
  checked,
  onChange,
  disabled,
}: LiquidSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-white/[0.16]'
      }`}
    >
      <span
        aria-hidden
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${checked ? 20 : 0}px)` }}
      />
    </button>
  );
});
