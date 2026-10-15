import type { ReactNode } from 'react';
import { InboxIcon } from './icons';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  children?: ReactNode;
}

/** Shown whenever a screen has no real data yet — never fabricated numbers. */
export function EmptyState({ title, description, icon, children }: EmptyStateProps) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
        {icon ?? <InboxIcon className="h-6 w-6" />}
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{description}</p>
      {children ? <div className="mx-auto mt-4 max-w-xl text-sm text-slate-500">{children}</div> : null}
    </section>
  );
}
