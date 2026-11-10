import { useEffect, useRef, useState } from 'react';
import { Search, X, SlidersHorizontal, Check, ChevronDown } from 'lucide-react';
import { Input, Select, Button } from '../ui/index.js';
import { STATUSES, SOURCES, EMPLOYMENT_TYPES, SORT_OPTIONS, PRIORITIES, DOT } from '../../lib/constants.js';
import { useLookups } from '../../context/LookupsContext.jsx';
import { cn } from '../../lib/format.js';

function StatusMultiSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={cn('input flex items-center justify-between gap-2 text-left', value.length && 'border-brand-400')}>
        <span className="truncate">{value.length ? `${value.length} status${value.length > 1 ? 'es' : ''}` : 'All statuses'}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-60 animate-scale-in rounded-lg border border-border bg-surface p-1 shadow-pop">
          {STATUSES.map((s) => (
            <button key={s.value} type="button" onClick={() => toggle(s.value)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-subtle">
              <span className={cn('flex h-4 w-4 items-center justify-center rounded border', value.includes(s.value) ? 'border-brand-600 bg-brand-600 text-white' : 'border-border')}>
                {value.includes(s.value) && <Check className="h-3 w-3" />}
              </span>
              <span className={cn('h-2 w-2 rounded-full', DOT[s.color])} />
              {s.label}
            </button>
          ))}
          {value.length > 0 && <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-subtle">Clear</button>}
        </div>
      )}
    </div>
  );
}

export const FILTER_KEYS = ['search', 'status', 'from', 'to', 'emailAccount', 'resume', 'employmentType', 'source', 'priority', 'tag'];

export function ApplicationFilters({ filters, onChange, showSort = true }) {
  const { emailAccounts, resumes } = useLookups();
  const [search, setSearch] = useState(filters.search || '');
  const [expanded, setExpanded] = useState(false);
  const set = (k, v) => onChange({ ...filters, [k]: v || undefined });

  useEffect(() => { setSearch(filters.search || ''); }, [filters.search]);
  useEffect(() => {
    const t = setTimeout(() => { if ((filters.search || '') !== search) set('search', search.trim()); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const statusValue = filters.status ? filters.status.split(',') : [];
  const activeCount = FILTER_KEYS.filter((k) => k !== 'search' && filters[k]).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, title, job ID or tag" className="pl-9" />
        </div>
        <div className="w-44"><StatusMultiSelect value={statusValue} onChange={(v) => set('status', v.join(','))} /></div>
        {showSort && (
          <div className="w-44"><Select value={filters.sort || 'newest'} onChange={(e) => set('sort', e.target.value)} options={SORT_OPTIONS} aria-label="Sort" /></div>
        )}
        <Button variant={expanded || activeCount ? 'secondary' : 'ghost'} icon={SlidersHorizontal} onClick={() => setExpanded((x) => !x)}>
          Filters{activeCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{activeCount}</span>}
        </Button>
        {(activeCount > 0 || filters.search) && (
          <Button variant="ghost" size="sm" icon={X} onClick={() => onChange({ sort: filters.sort })}>Clear all</Button>
        )}
      </div>
      {expanded && (
        <div className="grid animate-slide-in gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted">Applied from<Input type="date" className="mt-1" value={filters.from || ''} onChange={(e) => set('from', e.target.value)} /></label>
          <label className="text-xs text-muted">Applied to<Input type="date" className="mt-1" value={filters.to || ''} onChange={(e) => set('to', e.target.value)} /></label>
          <label className="text-xs text-muted">Email account
            <Select className="mt-1" value={filters.emailAccount || ''} onChange={(e) => set('emailAccount', e.target.value)} placeholder="Any email"
              options={[...emailAccounts.map((a) => ({ value: a._id, label: a.email + (a.isArchived ? ' (archived)' : '') })), { value: 'none', label: 'No saved account' }]} />
          </label>
          <label className="text-xs text-muted">Resume version
            <Select className="mt-1" value={filters.resume || ''} onChange={(e) => set('resume', e.target.value)} placeholder="Any resume"
              options={[...resumes.map((r) => ({ value: r._id, label: `${r.name}${r.version ? ` (${r.version})` : ''}` })), { value: 'none', label: 'No resume' }]} />
          </label>
          <label className="text-xs text-muted">Job type
            <Select className="mt-1" value={filters.employmentType || ''} onChange={(e) => set('employmentType', e.target.value)} placeholder="Any type" options={EMPLOYMENT_TYPES} />
          </label>
          <label className="text-xs text-muted">Source
            <Select className="mt-1" value={filters.source || ''} onChange={(e) => set('source', e.target.value)} placeholder="Any source" options={SOURCES} />
          </label>
          <label className="text-xs text-muted">Priority
            <Select className="mt-1" value={filters.priority || ''} onChange={(e) => set('priority', e.target.value)} placeholder="Any priority" options={PRIORITIES} />
          </label>
          <label className="text-xs text-muted">Tag
            <Input className="mt-1" value={filters.tag || ''} onChange={(e) => set('tag', e.target.value)} placeholder="e.g. dream" />
          </label>
        </div>
      )}
    </div>
  );
}
