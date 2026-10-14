interface StatCardProps {
  label: string;
  value: number | string;
  caption?: string;
  tone?: 'default' | 'emerald' | 'amber' | 'sky';
}

const TONES: Record<NonNullable<StatCardProps['tone']>, { wrapper: string; value: string }> = {
  default: { wrapper: 'border-slate-200', value: 'text-slate-900' },
  emerald: { wrapper: 'border-emerald-200', value: 'text-emerald-700' },
  amber: { wrapper: 'border-amber-200', value: 'text-amber-700' },
  sky: { wrapper: 'border-sky-200', value: 'text-sky-700' },
};

/** Single KPI tile used on the dashboard. */
export function StatCard({ label, value, caption, tone = 'default' }: StatCardProps) {
  const palette = TONES[tone];
  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${palette.wrapper}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${palette.value}`}>{value}</p>
      {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
    </div>
  );
}
