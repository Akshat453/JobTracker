import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { STATUSES, DOT } from '../../lib/constants.js';
import { CompanyLogo, PriorityBadge } from '../ui/index.js';
import { fmtShort, cn } from '../../lib/format.js';
import { ApplicationActionsMenu } from './ApplicationActionsMenu.jsx';

/** Drag cards between status columns (native HTML5 drag and drop). */
export function KanbanBoard({ items, actions, hideEmpty }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const columns = STATUSES.map((s) => ({ ...s, items: items.filter((a) => a.status === s.value) }))
    .filter((c) => !hideEmpty || c.items.length);

  const drop = (status) => {
    const app = items.find((a) => a._id === dragId);
    setOver(null); setDragId(null);
    if (app && app.status !== status) actions.setStatus(app, status);
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 lg:-mx-8 lg:px-8">
      <div className="flex min-h-[60vh] gap-3">
        {columns.map((col) => (
          <div key={col.value}
            onDragOver={(e) => { e.preventDefault(); setOver(col.value); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
            onDrop={() => drop(col.value)}
            className={cn('flex w-72 shrink-0 flex-col rounded-xl border bg-subtle/50 transition-colors',
              over === col.value ? 'border-brand-400 bg-brand-50/60 dark:bg-brand-500/10' : 'border-border')}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className={cn('h-2 w-2 rounded-full', DOT[col.color])} />
              <span className="text-sm font-medium">{col.label}</span>
              <span className="ml-auto rounded-full bg-surface px-2 text-xs text-muted ring-1 ring-border">{col.items.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {col.items.map((a) => (
                <div key={a._id} draggable
                  onDragStart={(e) => { setDragId(a._id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                  className={cn('group cursor-grab rounded-lg border border-border bg-surface p-3 shadow-card transition active:cursor-grabbing hover:border-brand-300 dark:hover:border-brand-500/40',
                    dragId === a._id && 'opacity-40')}>
                  <div className="flex items-start gap-2.5">
                    <CompanyLogo name={a.company.name} website={a.company.website} size="sm" />
                    <Link to={`/applications/${a._id}`} className="min-w-0 flex-1" draggable={false}>
                      <p className="truncate text-sm font-medium hover:text-brand-600">{a.company.name}</p>
                      <p className="truncate text-xs text-muted">{a.jobTitle}</p>
                    </Link>
                    <span className="opacity-0 transition group-hover:opacity-100"><ApplicationActionsMenu app={a} actions={actions} /></span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-muted">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtShort(a.applicationDate)}</span>
                    <PriorityBadge priority={a.priority} />
                  </div>
                </div>
              ))}
              {!col.items.length && <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted">Drop here</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
