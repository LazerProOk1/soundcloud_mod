import type React from 'react';

/**
 * One settings section: anchor for the side navigation (`id`), a big title, an optional
 * one-line description and an action on the right (e.g. "Reset").
 */
export function SettingsSection({
  id,
  title,
  desc,
  action,
  children,
}: {
  id: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={`settings-${id}`} data-settings-id={id} className="settings-section scroll-mt-4">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[22px] font-bold tracking-tight text-white">{title}</h3>
          {desc && <div className="mt-1 text-[12px] tabular-nums text-white/40">{desc}</div>}
        </div>
        {action}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/**
 * Title + description on the left, control on the right. `stacked` puts the control under
 * the text instead (wide controls: segmented pickers, sliders, lists).
 */
export function SettingRow({
  title,
  desc,
  value,
  stacked,
  children,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  /** Short current value shown next to the title (e.g. "75%"). */
  value?: React.ReactNode;
  stacked?: boolean;
  children?: React.ReactNode;
}) {
  const text = (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-medium text-white/85">{title}</p>
        {value != null && (
          <span className="shrink-0 text-[12px] tabular-nums text-white/45">{value}</span>
        )}
      </div>
      {desc && <p className="mt-0.5 text-[12px] leading-snug text-white/40">{desc}</p>}
    </div>
  );
  if (stacked) {
    return (
      <div className="space-y-3">
        {text}
        {children}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-6">
      {text}
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsDivider() {
  return <div className="border-t border-white/[0.06]" />;
}
