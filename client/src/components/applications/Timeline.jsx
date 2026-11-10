import {
  Plus, ArrowRightLeft, Pencil, CalendarPlus, CalendarCheck, CalendarX, BellPlus, BellRing, FileText, StickyNote, Copy,
} from 'lucide-react';
import { StatusBadge } from '../ui/index.js';
import { fmtDateTime, timeAgo, cn } from '../../lib/format.js';
import { STATUS_MAP, DOT } from '../../lib/constants.js';

/** Vertical journey of status changes. */
export function StatusTimeline({ history = [] }) {
  const items = [...history].reverse();
  return (
    <ol className="relative space-y-5 pl-6">
      <span className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
      {items.map((h, i) => (
        <li key={h._id || i} className="relative">
          <span className={cn('absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-surface', DOT[STATUS_MAP[h.status]?.color], i === 0 && 'ring-4 ring-brand-500/15')} />
          <StatusBadge status={h.status} />
          <p className="mt-1 text-xs text-muted">{fmtDateTime(h.changedAt)}{h.from ? ` · from ${STATUS_MAP[h.from]?.short}` : ''}</p>
          {h.note && <p className="mt-1 text-sm">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}

const ICON = {
  created: Plus, status_changed: ArrowRightLeft, updated: Pencil, interview_added: CalendarPlus,
  interview_updated: CalendarCheck, interview_removed: CalendarX, reminder_added: BellPlus, reminder_completed: BellRing,
  resume_attached: FileText, note: StickyNote, duplicated: Copy,
};

export function ActivityTimeline({ activity = [] }) {
  const items = [...activity].sort((a, b) => new Date(b.at) - new Date(a.at));
  return (
    <ol className="space-y-4">
      {items.map((a) => {
        const Icon = ICON[a.type] || Pencil;
        return (
          <li key={a._id} className="flex gap-3">
            <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border',
              a.type === 'note' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10' : 'bg-subtle text-muted')}>
              <Icon className="h-3 w-3" />
            </span>
            <div className="min-w-0">
              <p className={cn('text-sm', a.type === 'note' && 'whitespace-pre-wrap rounded-lg bg-subtle/60 px-3 py-2')}>{a.message}</p>
              {a.meta?.fields?.length > 0 && <p className="text-xs text-muted">Changed: {a.meta.fields.join(', ')}</p>}
              <p className="text-xs text-muted" title={fmtDateTime(a.at)}>{timeAgo(a.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
