import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Plus, Bell, CheckCircle2, Circle, Pencil, Trash2, MoreHorizontal, AlertCircle, CalendarClock, Send, Flag, Repeat } from 'lucide-react';
import { remindersApi, applicationsApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Button, Badge, Menu, EmptyState, ErrorState, SkeletonRows, Tabs, ConfirmDialog } from '../components/ui/index.js';
import { ReminderFormModal } from '../components/reminders/ReminderFormModal.jsx';
import { fmtDateTime, relativeDay, isOverdue, cn } from '../lib/format.js';

const TYPE_META = {
  follow_up: { label: 'Follow-up', icon: Send, tone: 'blue' },
  interview: { label: 'Interview', icon: CalendarClock, tone: 'violet' },
  deadline: { label: 'Deadline', icon: Flag, tone: 'amber' },
  custom: { label: 'Custom', icon: Bell, tone: 'slate' },
};

export default function RemindersPage() {
  const toast = useToast();
  const { refreshReminders } = useOutletContext() || {};
  const [view, setView] = useState('open');
  const { data, loading, error, reload, setData } = useAsync(() => remindersApi.list({ view }), [view]);
  const apps = useAsync(() => applicationsApi.list({ limit: 500, sort: 'updated' }).then((r) => r.items), []);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const items = data?.items || [];
  const counts = data?.counts || {};

  const toggle = async (r) => {
    setData((d) => ({ ...d, items: d.items.filter((x) => x._id !== r._id) }));
    try {
      await remindersApi.update(r._id, { completed: !r.completed });
      if (!r.completed) toast.success('Reminder completed', { action: { label: 'Undo', onClick: () => remindersApi.update(r._id, { completed: false }).then(() => { reload(); refreshReminders?.(); }) } });
      refreshReminders?.();
      reload();
    } catch (e) { toast.error(errorMessage(e)); reload(); }
  };
  const doDelete = async () => {
    try { await remindersApi.remove(toDelete._id); toast.success('Reminder deleted'); setToDelete(null); reload(); refreshReminders?.(); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div>
      <PageHeader title="Reminders" description="Follow-ups, interviews and deadlines in one place."
        actions={<Button icon={Plus} onClick={() => setModal({})}>New reminder</Button>} />

      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-md">
        <button onClick={() => setView('overdue')} className="card p-3 text-left transition hover:border-red-300"><p className="text-xs text-muted">Overdue</p><p className={cn('text-xl font-semibold', counts.overdue && 'text-red-600 dark:text-red-400')}>{counts.overdue ?? '–'}</p></button>
        <button onClick={() => setView('today')} className="card p-3 text-left transition hover:border-brand-300"><p className="text-xs text-muted">Today</p><p className="text-xl font-semibold">{counts.today ?? '–'}</p></button>
        <button onClick={() => setView('upcoming')} className="card p-3 text-left transition hover:border-brand-300"><p className="text-xs text-muted">Upcoming</p><p className="text-xl font-semibold">{counts.upcoming ?? '–'}</p></button>
      </div>

      <div className="card">
        <Tabs className="px-3" value={view} onChange={setView} tabs={[
          { value: 'open', label: 'All open' }, { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Today' },
          { value: 'upcoming', label: 'Upcoming' }, { value: 'completed', label: 'Completed' },
        ]} />
        {error ? <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
          : loading && !data ? <SkeletonRows className="p-5" />
            : !items.length ? <EmptyState icon={view === 'completed' ? CheckCircle2 : Bell} title={view === 'completed' ? 'Nothing completed yet' : 'Nothing here'} description={view === 'overdue' ? 'No overdue follow-ups — nice.' : 'Reminders are created automatically from follow-up dates, deadlines and interviews.'} />
              : (
                <ul className="divide-y divide-border">
                  {items.map((r) => {
                    const meta = TYPE_META[r.type] || TYPE_META.custom;
                    const overdue = !r.completed && isOverdue(r.dueDate);
                    return (
                      <li key={r._id} className="flex items-start gap-3 px-5 py-3.5">
                        <button onClick={() => toggle(r)} className="mt-0.5 text-muted transition hover:text-emerald-500" aria-label={r.completed ? 'Mark incomplete' : 'Mark complete'}>
                          {r.completed ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm font-medium', r.completed && 'text-muted line-through')}>{r.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            <Badge tone={meta.tone}><meta.icon className="h-3 w-3" />{meta.label}</Badge>
                            <span className={cn(overdue && 'inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400')}>
                              {overdue && <AlertCircle className="h-3 w-3" />}{fmtDateTime(r.dueDate)} · {relativeDay(r.dueDate)}
                            </span>
                            {r.application && <Link className="link" to={`/applications/${r.application._id}`}>{r.application.company?.name} — {r.application.jobTitle}</Link>}
                            {r.origin === 'auto' && <span className="inline-flex items-center gap-1" title="Kept in sync with the application's dates"><Repeat className="h-3 w-3" />auto</span>}
                          </div>
                          {r.notes && <p className="mt-1 text-sm text-muted">{r.notes}</p>}
                        </div>
                        <Menu trigger={<button className="rounded-md p-1.5 text-muted hover:bg-subtle" aria-label="Reminder actions"><MoreHorizontal className="h-4 w-4" /></button>}
                          items={[
                            { label: 'Edit', icon: Pencil, onClick: () => setModal({ reminder: r }) },
                            { label: 'Delete', icon: Trash2, danger: true, onClick: () => setToDelete(r) },
                          ]} />
                      </li>
                    );
                  })}
                </ul>
              )}
      </div>

      <ReminderFormModal open={!!modal} onClose={() => setModal(null)} reminder={modal?.reminder} applications={apps.data || []} onSaved={() => { reload(); refreshReminders?.(); }} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={doDelete} title="Delete reminder?" message={`"${toDelete?.title}" will be removed.`} />
    </div>
  );
}
