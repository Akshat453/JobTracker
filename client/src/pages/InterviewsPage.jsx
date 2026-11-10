import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, CalendarClock, Video, MapPin, Pencil, Trash2, MoreHorizontal, User } from 'lucide-react';
import { interviewsApi, applicationsApi } from '../api/endpoints.js';
import { errorMessage } from '../api/client.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, Button, Badge, Menu, EmptyState, ErrorState, SkeletonRows, Segmented, ConfirmDialog, StatusBadge } from '../components/ui/index.js';
import { InterviewFormModal } from '../components/interviews/InterviewFormModal.jsx';
import { fmtTime, relativeDay } from '../lib/format.js';

const STATUS_TONE = { Scheduled: 'violet', Completed: 'green', Rescheduled: 'amber', Cancelled: 'zinc' };
const RESULT_TONE = { Passed: 'green', Failed: 'red', Pending: 'amber', 'N/A': 'zinc' };

function groupByDay(items) {
  const groups = new Map();
  for (const iv of items) {
    const key = iv.date ? new Date(iv.date).toDateString() : 'No date';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(iv);
  }
  return [...groups.entries()];
}

export default function InterviewsPage() {
  const toast = useToast();
  const [when, setWhen] = useState('upcoming');
  const { data, loading, error, reload } = useAsync(() => interviewsApi.list(when === 'all' ? {} : { when }), [when]);
  const apps = useAsync(() => applicationsApi.list({ limit: 500, sort: 'updated' }).then((r) => r.items), []);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const items = data?.items || [];

  const quickStatus = async (iv, status) => {
    try { await interviewsApi.update(iv._id, { status }); toast.success(`Marked ${status.toLowerCase()}`); reload(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const doDelete = async () => {
    try { await interviewsApi.remove(toDelete._id); toast.success('Interview deleted'); setToDelete(null); reload(); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div>
      <PageHeader title="Interviews" description="All interview rounds across your applications."
        actions={<Button icon={Plus} onClick={() => setModal({})}>Schedule interview</Button>} />
      <div className="mb-4">
        <Segmented value={when} onChange={setWhen} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} />
      </div>

      {error ? <ErrorState message={error} onRetry={reload} />
        : loading && !data ? <div className="card p-5"><SkeletonRows /></div>
          : !items.length ? (
            <div className="card"><EmptyState icon={CalendarClock} title={when === 'upcoming' ? 'No upcoming interviews' : 'No interviews'} description="Interviews you add to applications appear here." action={<Button icon={Plus} onClick={() => setModal({})}>Schedule interview</Button>} /></div>
          ) : (
            <div className="space-y-6">
              {groupByDay(items).map(([day, list]) => (
                <section key={day}>
                  <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    {day === 'No date' ? day : new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {day !== 'No date' && <span className="normal-case font-normal">· {relativeDay(day)}</span>}
                  </h2>
                  <div className="card divide-y divide-border">
                    {list.map((iv) => (
                      <div key={iv._id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                        <div className="w-16 shrink-0 text-sm font-medium tabular-nums">{iv.date && iv.time ? fmtTime(iv.date) : <span className="text-muted">—</span>}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/applications/${iv.application?._id}`} className="font-medium hover:text-brand-600">{iv.application?.company?.name}</Link>
                            <span className="text-muted">·</span><span>{iv.roundName}</span>
                            <Badge tone={STATUS_TONE[iv.status]}>{iv.status}</Badge>
                            {iv.result && iv.result !== 'Pending' && <Badge tone={RESULT_TONE[iv.result]}>{iv.result}</Badge>}
                          </div>
                          <p className="mt-0.5 text-sm text-muted">{iv.application?.jobTitle} · {iv.type}</p>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            {iv.meetingLink && <a href={iv.meetingLink} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1"><Video className="h-3.5 w-3.5" />Join</a>}
                            {iv.location && <span className="inline-flex items-center gap-1 text-muted"><MapPin className="h-3.5 w-3.5" />{iv.location}</span>}
                            {iv.interviewerName && <span className="inline-flex items-center gap-1 text-muted"><User className="h-3.5 w-3.5" />{iv.interviewerName}</span>}
                          </div>
                        </div>
                        {iv.application?.status && <StatusBadge status={iv.application.status} short className="hidden sm:inline-flex" />}
                        <Menu trigger={<button className="rounded-md p-1.5 text-muted hover:bg-subtle" aria-label="Interview actions"><MoreHorizontal className="h-4 w-4" /></button>}
                          items={[
                            { label: 'Edit', icon: Pencil, onClick: () => setModal({ interview: iv }) },
                            iv.status !== 'Completed' && { label: 'Mark completed', onClick: () => quickStatus(iv, 'Completed') },
                            iv.status !== 'Cancelled' && { label: 'Mark cancelled', onClick: () => quickStatus(iv, 'Cancelled') },
                            { divider: true },
                            { label: 'Delete', icon: Trash2, danger: true, onClick: () => setToDelete(iv) },
                          ]} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
      <InterviewFormModal open={!!modal} onClose={() => setModal(null)} interview={modal?.interview} applications={apps.data || []}
        onSaved={(res) => { reload(); if (res?.applicationStatus) toast.info('Application status updated to match'); }} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={doDelete} title="Delete interview?" message={`"${toDelete?.roundName}" will be removed.`} />
    </div>
  );
}
