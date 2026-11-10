import { forwardRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/format.js';

export function Field({ label, error, hint, required, className, children, htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}{required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, error, ...props }, ref) {
  return <input ref={ref} className={cn('input', error && 'input-error', className)} aria-invalid={!!error} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, error, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('input resize-y', error && 'input-error', className)} {...props} />;
});

/** Native select styled to match. `options` = strings or {value,label}. */
export const Select = forwardRef(function Select({ className, error, options = [], placeholder, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn('input appearance-none bg-[length:16px] bg-[right_.6rem_center] bg-no-repeat pr-8', error && 'input-error', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")" }}
      {...props}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>;
      })}
      {children}
    </select>
  );
});

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <button
        type="button" role="switch" aria-checked={!!checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-border')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-medium">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
    </label>
  );
}

/** Segmented Yes/No choice. */
export function YesNo({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-subtle p-0.5">
      {[['Yes', true], ['No', false]].map(([l, v]) => (
        <button key={l} type="button" onClick={() => onChange(v)}
          className={cn('rounded-md px-3 py-1 text-xs font-medium transition', value === v ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg')}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Chip-style multi-value input (Enter or comma to add). */
export function TagInput({ value = [], onChange, placeholder = 'Type and press Enter', suggestions = [] }) {
  const [draft, setDraft] = useState('');
  const add = (raw) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    parts.forEach((p) => { if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p); });
    onChange(next);
    setDraft('');
  };
  const listId = `tags-${placeholder.length}`;
  return (
    <div className="input flex min-h-[38px] flex-wrap items-center gap-1.5 py-1.5">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-xs font-medium">
          {t}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} className="text-muted hover:text-fg" aria-label={`Remove ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        list={suggestions.length ? listId : undefined}
        value={draft}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); add(draft); }
          if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? '' : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
      />
      {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
    </div>
  );
}
