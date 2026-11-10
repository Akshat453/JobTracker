import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, initials, domainOf } from '../../lib/format.js';
import { useState } from 'react';

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName, padded = true }) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="text-xs text-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cn(padded && 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-border scrollbar-thin', className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} type="button" onClick={() => onChange(t.value)}
          className={cn('relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors',
            value === t.value ? 'text-fg' : 'text-muted hover:text-fg')}>
          {t.icon && <t.icon className="h-4 w-4" />}
          {t.label}
          {t.badge != null && <span className="rounded-full bg-subtle px-1.5 text-[11px] text-muted">{t.badge}</span>}
          {t.error && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-subtle p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} title={o.label}
          className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          <span className={o.icon ? 'hidden sm:inline' : ''}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onChange, limit }) {
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex items-center justify-between gap-4 px-1 py-3 text-sm text-muted">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-md p-1.5 hover:bg-subtle disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-2 text-fg">{page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="rounded-md p-1.5 hover:bg-subtle disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

const LOGO_BG = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-pink-500', 'bg-violet-500', 'bg-teal-500', 'bg-orange-500'];

/** Company favicon from its website, falling back to coloured initials. */
export function CompanyLogo({ name = '', website, size = 'md' }) {
  const [failed, setFailed] = useState(false);
  const domain = website ? domainOf(website) : null;
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-xs';
  const color = LOGO_BG[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % LOGO_BG.length];
  if (domain && !failed) {
    return (
      <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white', dim)}>
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" className="h-3/5 w-3/5" onError={() => setFailed(true)} loading="lazy" />
      </span>
    );
  }
  return <span className={cn('flex shrink-0 items-center justify-center rounded-lg font-semibold text-white', dim, color)}>{initials(name)}</span>;
}

export function DefinitionList({ items, cols = 2 }) {
  const visible = items.filter((i) => i && i.value !== undefined && i.value !== null && i.value !== '' && i.value !== false);
  if (!visible.length) return <p className="text-sm text-muted">Nothing recorded.</p>;
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : '')}>
      {visible.map((i) => (
        <div key={i.label} className={cn('min-w-0', i.full && 'sm:col-span-full')}>
          <dt className="text-xs text-muted">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
